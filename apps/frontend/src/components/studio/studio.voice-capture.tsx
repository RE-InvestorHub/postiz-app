'use client';

// Voice capture — record (browser mic) OR upload audio, both → the brain via
// studio.upload-client. Recording is a BROWSER concern (the mic belongs to the
// device running Postiz, not the NUC); the recorded blob uploads like any file.
//
// getUserMedia only works in a secure context (HTTPS or localhost) — when it's
// unavailable, Record is disabled with a clear note and Upload still works.
//
// Postiz tokens only; magenta bg-ai accent (AI feature). No new npm deps.

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';

interface Props {
  onUploaded: (asset: UploadedAsset) => void;
  /** Allow uploading multiple files at once (default true). */
  multiple?: boolean;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

export const StudioVoiceCapture: FC<Props> = ({ onUploaded, multiple = true }) => {
  const secure = typeof window !== 'undefined' && window.isSecureContext &&
    !!navigator.mediaDevices?.getUserMedia;

  const [mode, setMode] = useState<'idle' | 'recording' | 'recorded'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0); // 0..1 mic level
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupMeter = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    rafRef.current = null;
    tickRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    cleanupMeter();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [cleanupMeter, previewUrl]);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        blobRef.current = blob;
        setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(blob); });
        setMode('recorded');
        cleanupMeter();
      };
      mr.start();
      setMode('recording');
      setElapsed(0);
      tickRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

      // Lightweight level meter via AnalyserNode.
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const loop = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setLevel(avg);
        rafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Microphone access failed.');
      cleanupMeter();
      setMode('idle');
    }
  }, [cleanupMeter]);

  const stopRecording = useCallback(() => {
    mediaRef.current?.stop();
  }, []);

  const retake = useCallback(() => {
    blobRef.current = null;
    setPreviewUrl((old) => { if (old) URL.revokeObjectURL(old); return null; });
    setMode('idle');
    setElapsed(0);
  }, []);

  const doUpload = useCallback(async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const asset = await uploadFileToBrain(file);
      onUploaded(asset);
      return true;
    } catch (e: unknown) {
      setError((e as Error)?.message ?? 'Upload failed.');
      return false;
    } finally {
      setUploading(false);
    }
  }, [onUploaded]);

  const uploadRecording = useCallback(async () => {
    if (!blobRef.current) return;
    const ext = (blobRef.current.type.split('/')[1] || 'webm').split(';')[0];
    const file = new File([blobRef.current], `recording-${Date.now()}.${ext}`, { type: blobRef.current.type });
    if (await doUpload(file)) retake();
  }, [doUpload, retake]);

  const onPick = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files).forEach((f) => doUpload(f));
  }, [doUpload]);

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Record surface */}
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
        {!secure ? (
          <p className="text-[12px] text-textItemBlur leading-[1.5]">
            Recording needs HTTPS or localhost — this page isn’t a secure context, so the mic is
            unavailable here. Upload an audio file below instead.
          </p>
        ) : mode === 'idle' ? (
          <button type="button" onClick={startRecording} className="h-[44px] px-[16px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] self-start">
            ● Record from mic
          </button>
        ) : mode === 'recording' ? (
          <div className="flex items-center gap-[12px]">
            <button type="button" onClick={stopRecording} className="h-[44px] px-[16px] rounded-[8px] bg-red-500 text-white font-[600] text-[13px]">
              ■ Stop
            </button>
            <span className="text-[13px] text-btnText tabular-nums">{fmt(elapsed)}</span>
            <div className="flex-1 h-[6px] rounded-full bg-newBorder overflow-hidden">
              <div className="h-full rounded-full bg-ai transition-[width] duration-100" style={{ width: `${Math.min(100, Math.round(level * 140))}%` }} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-[10px]">
            {previewUrl && <audio src={previewUrl} controls className="w-full h-[36px]" />}
            <div className="flex items-center gap-[8px]">
              <button type="button" disabled={uploading} onClick={uploadRecording} className="h-[40px] px-[16px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">
                {uploading ? 'Uploading…' : 'Use this take'}
              </button>
              <button type="button" disabled={uploading} onClick={retake} className="h-[40px] px-[14px] rounded-[8px] bg-btnSimple text-btnText text-[13px] disabled:opacity-50">
                Re-take
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Upload surface */}
      <label className="flex flex-col items-center justify-center gap-[6px] rounded-[8px] border-2 border-dashed border-newBorder bg-newBgColor px-[20px] py-[20px] cursor-pointer hover:border-ai/50 transition-colors text-center">
        <span className="text-[13px] font-[600] text-btnText">Or upload audio</span>
        <span className="text-[11px] text-textItemBlur leading-[1.4]">Existing recordings (podcast, webinar, calls) — clean single-speaker audio works best</span>
        <input type="file" accept="audio/*" multiple={multiple} className="sr-only" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
      </label>

      {error && <span className="text-[12px] text-red-400">{error}</span>}
    </div>
  );
};
