'use client';

// Multi-voice render + Audio Library + Voice Mirror — the Plan 2 additions to the Writer's Room
// canvas. Three self-contained pieces the ScriptCanvas mounts:
//   • MultiVoiceRenderBar — cast → render the whole script to ONE stitched multi-voice track. Live
//     cost estimate (chars = TTS credits) + a gated "⚡ Render" spend button + async progress. A
//     free dry-run verifies casting/timing without spending.
//   • RenderedTracksSection — the Audio Library for this script: rendered tracks as cards with
//     waveform playback, per-line re-render (only that line spends), caption download, Assign to Ad,
//     and delete.
//   • VoiceMirrorButton — a 🎙 Record pop-out: record my voice (raw, free) or mirror it into an
//     ElevenLabs voice via speech-to-speech (gated spend), keeping my delivery.
//
// New file (merge-safe). Postiz tokens only; magenta bg-ai on AI actions, spend actions styled as
// spends. Reuses WaveformTrack, StudioVoicePicker, StudioVoiceCapture — no new UI kit.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScriptDoc } from '@gitroom/frontend/components/studio/studio.types';
import { StudioVoicePicker } from '@gitroom/frontend/components/studio/studio.voice-picker';
import { StudioVoiceCapture } from '@gitroom/frontend/components/studio/studio.voice-capture';
import { WaveformTrack } from '@gitroom/frontend/components/studio/studio.waveform-track';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  renderScriptAudio, renderAudioLine, pollAudioRender, listAudioLibrary, deleteAudioTrack,
  mirrorVoice, listVoiceLibrary, RenderStarted, AudioTrack, VoiceOption,
} from '@gitroom/frontend/components/studio/studio.voice-client';

const AUDIO_LIB_REFRESH = 'reinvestorhub:audio-library-refresh';
const fireRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUDIO_LIB_REFRESH)); };
// Tick the Project-bar credits badge after an ElevenLabs spend (render / line re-render / mirror).
const fireCreditsRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:credits-refresh')); };

const Spinner: FC = () => (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
const Recycle: FC = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
  </svg>
);

// Client-side cost estimate (the brain is authoritative; this is the live badge). TTS = 1 cr/char.
function estimateCost(script: ScriptDoc): { lines: number; chars: number; credits: number; voices: number } {
  const cast = new Map(script.cast.map((c) => [c.id, c]));
  let lines = 0, chars = 0;
  const voices = new Set<string>();
  for (const b of script.beats) for (const l of b.lines) {
    const t = (l.text || '').trim();
    if (!t) continue;
    lines++; chars += t.length;
    voices.add((l.character_id && cast.get(l.character_id)?.voice_id) || '(house)');
  }
  return { lines, chars, credits: chars, voices: voices.size };
}

// ── Render bar ───────────────────────────────────────────────────────────────
export const MultiVoiceRenderBar: FC<{ script: ScriptDoc; brandKitId: string }> = ({ script, brandKitId }) => {
  const cost = useMemo(() => estimateCost(script), [script]);
  const [busy, setBusy] = useState<null | 'dry' | 'real'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const dryRun = async () => {
    setBusy('dry'); setErr(null);
    try {
      await renderScriptAudio({ scriptId: script.script_id, brandKitId, dryRun: true });
      fireRefresh();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); }
  };
  const render = async () => {
    setConfirming(false); setBusy('real'); setErr(null); setProgress({ done: 0, total: cost.lines });
    try {
      const started = (await renderScriptAudio({ scriptId: script.script_id, brandKitId })) as RenderStarted;
      if (!started.jobId) throw new Error('Render did not start.');
      await pollAudioRender(started.jobId, setProgress);
      fireRefresh(); fireCreditsRefresh();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); setProgress(null); }
  };

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[10px] flex-wrap">
        <span className="text-[13px] font-[600] text-btnText">Multi-voice render</span>
        <span className="text-[11px] text-textItemBlur flex-1 hidden lg:inline">
          Render every line in its character&apos;s cast voice + tone, stitched in beat order into one track. Cast voices in the Cast section below.
        </span>
        <span className="text-[11px] text-textItemBlur tabular-nums">
          {cost.lines} line{cost.lines === 1 ? '' : 's'} · {cost.voices} voice{cost.voices === 1 ? '' : 's'} · ~{cost.credits} cr
        </span>
        <button type="button" onClick={dryRun} disabled={!!busy || !cost.lines}
          title="Free: stitch silent stubs to check casting + timing without spending credits"
          className="h-[34px] px-[12px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover disabled:opacity-40 inline-flex items-center gap-[6px]">
          {busy === 'dry' && <Spinner />}Dry run
        </button>
        <button type="button" onClick={() => setConfirming(true)} disabled={!!busy || !cost.lines}
          title="Render for real — SPENDS TTS credits"
          className="h-[34px] px-[16px] rounded-[8px] bg-ai text-white font-[600] text-[13px] inline-flex items-center gap-[6px] disabled:opacity-50">
          {busy === 'real' && <Spinner />}
          {busy === 'real' && progress ? `Rendering ${progress.done}/${progress.total}…` : '⚡ Render'}
        </button>
      </div>
      {confirming && (
        <div className="flex items-center gap-[10px] rounded-[8px] border border-ai/40 bg-ai/10 px-[12px] py-[8px] text-[12px] text-btnText">
          <span className="flex-1">Render {cost.lines} lines in {cost.voices} voice{cost.voices === 1 ? '' : 's'}? This spends about <span className="font-[700]">{cost.credits} credits</span>.</span>
          <button type="button" onClick={render} className="h-[30px] px-[12px] rounded-[6px] bg-ai text-white font-[600]">Render</button>
          <button type="button" onClick={() => setConfirming(false)} className="h-[30px] px-[10px] rounded-[6px] border border-newBorder text-textItemBlur hover:text-btnText">Cancel</button>
        </div>
      )}
      {err && <div className="text-[12px] text-red-400 leading-[1.4]">{err}</div>}
    </div>
  );
};

// ── Rendered tracks (the Audio Library for this script) ───────────────────────
export const RenderedTracksSection: FC<{ script: ScriptDoc; brandKitId: string; activeAdId: string | null }> = ({ script, brandKitId, activeAdId }) => {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    listAudioLibrary(brandKitId)
      .then((r) => setTracks((r.tracks || []).filter((t) => t.stage === 'rendered' && t.scriptId === script.script_id)))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [brandKitId, script.script_id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => refresh();
    window.addEventListener(AUDIO_LIB_REFRESH, on);
    return () => window.removeEventListener(AUDIO_LIB_REFRESH, on);
  }, [refresh]);

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[8px]">
        <span className="text-[13px] font-[600] text-btnText">Rendered tracks</span>
        <span className="text-[11px] text-textItemBlur flex-1 hidden lg:inline">Multi-voice tracks for this script. Play, re-render a single line, download captions, or assign to the active ad.</span>
        {loading && <Spinner />}
      </div>
      {tracks.length === 0 ? (
        <span className="text-[12px] text-textItemBlur">No rendered tracks yet. Cast your voices and hit ⚡ Render above.</span>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {tracks.map((t) => <TrackCard key={t.id} track={t} activeAdId={activeAdId} onChanged={refresh} />)}
        </div>
      )}
    </div>
  );
};

const TrackCard: FC<{ track: AudioTrack; activeAdId: string | null; onChanged: () => void }> = ({ track, activeAdId, onChanged }) => {
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [bound, setBound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const reLine = async (lineId: string) => {
    setBusyLine(lineId); setErr(null);
    try {
      const started = await renderAudioLine({ trackId: track.id, lineId });
      await pollAudioRender(started.jobId);
      onChanged(); fireCreditsRefresh();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusyLine(null); }
  };
  const assign = async () => {
    if (!activeAdId) { setErr('Select an active ad first (Director bar above).'); return; }
    setErr(null);
    try { await addObject({ adId: activeAdId, type: 'audio', id: track.id }); setBound(true); setTimeout(() => setBound(false), 2500); }
    catch (e) { setErr((e as Error)?.message ?? String(e)); }
  };
  const del = async () => {
    setConfirmDel(false);
    try { await deleteAudioTrack(track.id); onChanged(); } catch (e) { setErr((e as Error)?.message ?? String(e)); }
  };

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] flex flex-col gap-[8px]">
      <div className="flex items-center gap-[8px] flex-wrap">
        {track.dryRun && <span className="text-[10px] uppercase tracking-wide rounded-[4px] border border-newBorder px-[6px] py-[1px] text-textItemBlur">dry run</span>}
        <span className="text-[11px] text-textItemBlur tabular-nums">{track.durationS ? `${track.durationS}s` : ''} · {(track.voicesUsed || []).length} voice{(track.voicesUsed || []).length === 1 ? '' : 's'}</span>
        <span className="flex-1" />
        {track.srtUrl && <a href={track.srtUrl} download className="text-[11px] text-textItemBlur hover:text-btnText underline decoration-dotted">SRT</a>}
        {track.vttUrl && <a href={track.vttUrl} download className="text-[11px] text-textItemBlur hover:text-btnText underline decoration-dotted">VTT</a>}
        <button type="button" onClick={assign} disabled={!activeAdId}
          className={'h-[28px] px-[10px] rounded-[6px] border text-[11px] font-[600] ' + (bound ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText hover:bg-boxHover') + ' disabled:opacity-40'}
          title={activeAdId ? 'Use this track as the ad audio' : 'Select an active ad first'}>{bound ? '✓ Assigned' : '→ Ad'}</button>
        {confirmDel ? (
          <>
            <button type="button" onClick={del} className="h-[28px] px-[8px] rounded-[6px] bg-[#ff7eb6] text-[#3a0d23] font-[700] text-[11px]">Delete</button>
            <button type="button" onClick={() => setConfirmDel(false)} className="h-[28px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur">Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className="h-[28px] w-[28px] rounded-[6px] text-textItemBlur hover:text-btnText" title="Delete track">🗑</button>
        )}
      </div>
      <WaveformTrack url={track.url} onError={setErr} />
      {track.lineSpans && track.lineSpans.length > 0 && (
        <div className="flex flex-col gap-[4px] pt-[2px]">
          {track.lineSpans.map((s) => (
            <div key={s.lineId} className="flex items-center gap-[8px] text-[11px]">
              <span className="text-textItemBlur w-[64px] shrink-0 truncate">{s.characterName || 'Narrator'}</span>
              <span className="text-btnText flex-1 min-w-0 truncate">{s.text}</span>
              <span className="text-textItemBlur tabular-nums shrink-0">{Math.round(s.start)}s</span>
              <button type="button" onClick={() => reLine(s.lineId)} disabled={!!busyLine || track.dryRun}
                title={track.dryRun ? 'Render for real first' : 'Re-render just this line (spends one line)'}
                className="shrink-0 h-[24px] w-[24px] rounded-[6px] flex items-center justify-center text-textItemBlur hover:text-ai hover:bg-ai/10 disabled:opacity-40">
                {busyLine === s.lineId ? <Spinner /> : <Recycle />}
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <div className="text-[12px] text-red-400 leading-[1.4]">{err}</div>}
    </div>
  );
};

// ── Voice Mirror pop-out ──────────────────────────────────────────────────────
export const VoiceMirrorButton: FC<{ script: ScriptDoc; brandKitId: string }> = ({ script, brandKitId }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="h-[34px] px-[12px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover inline-flex items-center gap-[6px]"
        title="Record your voice — keep it raw, or mirror it into an ElevenLabs voice">🎙 Record</button>
      {open && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => setOpen(false)}>
          <div className="w-[560px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-[8px]">
              <span className="text-[15px] font-[700] text-btnText flex-1">Record voice</span>
              <button type="button" onClick={() => setOpen(false)} className="h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText">✕</button>
            </div>
            <VoiceMirrorInner script={script} brandKitId={brandKitId} />
          </div>
        </div>, document.body)}
    </>
  );
};

const VoiceMirrorInner: FC<{ script: ScriptDoc; brandKitId: string }> = ({ script, brandKitId }) => {
  const [mirror, setMirror] = useState(false);
  const [voiceId, setVoiceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ url: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Default the mirror target to the first ready voice when mirroring is turned on.
  useEffect(() => {
    if (!mirror || voiceId) return;
    let live = true;
    listVoiceLibrary().then((list: VoiceOption[]) => { if (live) { const f = list.find((v) => v.ready); if (f) setVoiceId(f.voiceId); } }).catch(() => undefined);
    return () => { live = false; };
  }, [mirror, voiceId]);

  const onUploaded = useCallback(async (asset: { url: string }) => {
    setErr(null); setResult(null); setNote(null);
    if (!mirror) { setNote('Saved your recording to this brand’s audio pool.'); setResult({ url: asset.url }); return; }
    if (!voiceId) { setErr('Pick a target voice to mirror into.'); return; }
    setBusy(true);
    try {
      const r = await mirrorVoice({ srcUrl: asset.url, voiceId, scriptId: script.script_id, brandKitId });
      setResult({ url: r.url });
      setNote('Mirrored into the selected voice.');
      fireRefresh(); fireCreditsRefresh();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(false); }
  }, [mirror, voiceId, script.script_id, brandKitId]);

  return (
    <div className="flex flex-col gap-[12px]">
      <label className="flex items-center gap-[8px] text-[12px] text-btnText">
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} />
        Voice mirroring
        <span className="text-textItemBlur text-[11px]">— play my performance back in an ElevenLabs voice (keeps my timing). Spends credits.</span>
      </label>
      {mirror && (
        <label className="flex items-center gap-[8px] text-[12px] font-[600] text-textItemBlur">Into
          <StudioVoicePicker value={voiceId} onChange={setVoiceId} onError={setErr} />
        </label>
      )}
      <StudioVoiceCapture onUploaded={onUploaded} multiple={false} />
      {busy && <div className="text-[12px] text-textItemBlur inline-flex items-center gap-[6px]"><Spinner /> Mirroring…</div>}
      {result && <div className="flex flex-col gap-[6px]"><WaveformTrack url={result.url} onError={setErr} />{note && <span className="text-[11px] text-textItemBlur">{note}</span>}</div>}
      {err && <div className="text-[12px] text-red-400 leading-[1.4]">{err}</div>}
    </div>
  );
};
