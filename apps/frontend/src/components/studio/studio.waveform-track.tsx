'use client';

// WaveformTrack — a reusable single-line audio track (Plan 1b). Decodes an audio URL with the Web
// Audio API, draws a peaks waveform to a <canvas>, and plays it back with a play/pause button, a
// moving playhead, click-to-seek, and a mm:ss readout. Native canvas + Web Audio only (no
// wavesurfer) — the same building block the Plan 3 Mixer reuses per lane. SSR-safe (all Web Audio
// touches happen in effects) and degrades to a plain <audio controls> if decode fails (CORS/format).
// Postiz tokens: the wave uses the magenta AI accent (--new-ai-btn) read from CSS so it tracks theme.

import { FC, useCallback, useEffect, useRef, useState } from 'react';

interface WaveformTrackProps {
  url: string;
  /** Canvas height in CSS px (default 48). */
  height?: number;
  /** Dim the wave + label it as not reflecting the latest edit (T3 stale-on-edit). */
  stale?: boolean;
  className?: string;
  onError?: (msg: string) => void;
}

const mmss = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

// Read a CSS custom property off :root so canvas colors track the Postiz theme; fall back to the
// documented magenta AI accent if the var is missing.
const cssVar = (name: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

export const WaveformTrack: FC<WaveformTrackProps> = ({ url, height = 48, stale = false, className, onError }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const peaksRef = useRef<Float32Array | null>(null);

  const [ready, setReady] = useState(false);   // peaks decoded → show custom UI
  const [failed, setFailed] = useState(false);  // decode failed → native <audio> fallback
  const [playing, setPlaying] = useState(false);
  const [dur, setDur] = useState(0);
  const [cur, setCur] = useState(0);

  // --- draw the wave (played portion in accent, rest dimmed) + a playhead ---
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks) return;
    const wrap = wrapRef.current;
    const cssW = Math.max(1, wrap?.clientWidth ?? canvas.clientWidth ?? 300);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${height}px`;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, height);

    const accent = cssVar('--new-ai-btn', '#d82d7e');
    const progress = dur > 0 ? cur / dur : 0;
    const barW = 2, gap = 1, step = barW + gap;
    const bars = Math.max(1, Math.floor(cssW / step));
    const mid = height / 2;
    for (let b = 0; b < bars; b++) {
      const p = peaks[Math.floor((b / bars) * peaks.length)] || 0;
      const bh = Math.max(1, p * (height * 0.9));
      const x = b * step;
      const played = x / cssW <= progress;
      ctx.globalAlpha = stale ? 0.35 : played ? 1 : 0.3;
      ctx.fillStyle = accent;
      ctx.fillRect(x, mid - bh / 2, barW, bh);
    }
    // Playhead
    if (progress > 0 && progress < 1) {
      ctx.globalAlpha = stale ? 0.5 : 1;
      ctx.fillStyle = accent;
      ctx.fillRect(Math.min(cssW - 1, progress * cssW), 0, 1, height);
    }
    ctx.globalAlpha = 1;
  }, [cur, dur, height, stale]);

  // --- decode the audio into peaks (client-only) ---
  useEffect(() => {
    let cancelled = false;
    const ctl = new AbortController();
    setReady(false); setFailed(false); setPlaying(false); setCur(0); setDur(0); peaksRef.current = null;
    if (typeof window === 'undefined' || !url) return;
    const AC: typeof AudioContext | undefined = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) { setFailed(true); return; }

    (async () => {
      try {
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buf = await res.arrayBuffer();
        const ac = new AC();
        const audioBuf = await ac.decodeAudioData(buf.slice(0));
        ac.close();
        if (cancelled) return;
        const raw = audioBuf.getChannelData(0);
        const N = 600;
        const block = Math.max(1, Math.floor(raw.length / N));
        const peaks = new Float32Array(N);
        let max = 0;
        for (let i = 0; i < N; i++) {
          let m = 0;
          const start = i * block;
          for (let j = 0; j < block; j++) { const v = Math.abs(raw[start + j] || 0); if (v > m) m = v; }
          peaks[i] = m; if (m > max) max = m;
        }
        if (max > 0) for (let i = 0; i < N; i++) peaks[i] /= max; // normalize
        peaksRef.current = peaks;
        setReady(true);
        requestAnimationFrame(draw);
      } catch (e) {
        if (cancelled || (e as Error)?.name === 'AbortError') return;
        setFailed(true);
        onError?.((e as Error)?.message ?? 'Could not decode audio for the waveform.');
      }
    })();
    return () => { cancelled = true; ctl.abort(); };
    // draw/onError are stable enough; re-decode only when the url changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // --- redraw on state changes + container resize ---
  useEffect(() => { draw(); }, [draw, ready]);
  useEffect(() => {
    if (typeof window === 'undefined' || !wrapRef.current) return;
    const ro = new ResizeObserver(() => draw());
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [draw]);

  // --- audio element playback events ---
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => setDur(a.duration || 0);
    const onTime = () => setCur(a.currentTime || 0);
    const onEnd = () => { setPlaying(false); setCur(a.duration || 0); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('ended', onEnd);
    a.addEventListener('play', onPlay);
    a.addEventListener('pause', onPause);
    return () => {
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('play', onPlay);
      a.removeEventListener('pause', onPause);
    };
  }, [url]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => undefined); else a.pause();
  };
  const seek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const a = audioRef.current;
    const wrap = wrapRef.current;
    if (!a || !wrap || !dur) return;
    const rect = wrap.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  };

  return (
    <div className={'flex items-center gap-[10px] ' + (className ?? '')}>
      {/* The audio element drives playback in both modes; hidden when the custom wave is shown. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={url} preload="metadata" controls={failed} className={failed ? 'w-full h-[36px]' : 'hidden'} />

      {!failed && (
        <>
          <button type="button" onClick={toggle} disabled={!ready}
            title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'}
            className="h-[34px] w-[34px] shrink-0 rounded-full bg-ai text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40">
            {playing
              ? (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>)
              : (<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>)}
          </button>
          <div ref={wrapRef} className="relative flex-1 min-w-0" style={{ height }}>
            {ready
              ? <canvas ref={canvasRef} onClick={seek} className="w-full cursor-pointer" style={{ height }} />
              : <div className="w-full h-full rounded-[6px] bg-newBgColorInner animate-pulse" />}
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-textItemBlur w-[74px] text-right">{mmss(cur)} / {mmss(dur)}</span>
        </>
      )}
    </div>
  );
};

export default WaveformTrack;
