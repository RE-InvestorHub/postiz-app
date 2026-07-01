'use client';

// RenderStrip + Voice Mirror — the unified render surface at the top of the Writer's Room canvas.
//   • RenderStrip — one place to turn the script into audio: a HOUSE-voice picker (the fallback for
//     any uncast line), a live cost estimate, a free Dry run (silent stubs to check casting/timing),
//     a gated ⚡ Generate (multi-voice render — each line in its cast voice + tone + v3 delivery
//     direction, uncast lines in the house voice, stitched in beat order), and the LATEST rendered
//     track inline (waveform + → Ad + delete + stale-on-edit). This replaces the old split of a
//     single-voice "Generate" preview and a separate multi-voice "Render" bar — the multi-voice
//     render is a superset (no cast = one house voice), so there is one button now.
//   • VoiceMirrorButton — a 🎙 Record pop-out: record raw (free) or mirror into an ElevenLabs voice
//     via speech-to-speech (gated), keeping the delivery.
//
// Postiz tokens only; magenta bg-ai on AI/spend actions. Reuses WaveformTrack, StudioVoicePicker,
// StudioVoiceCapture — no new UI kit.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { ScriptDoc } from '@gitroom/frontend/components/studio/studio.types';
import { StudioVoicePicker } from '@gitroom/frontend/components/studio/studio.voice-picker';
import { StudioVoiceCapture } from '@gitroom/frontend/components/studio/studio.voice-capture';
import { WaveformTrack } from '@gitroom/frontend/components/studio/studio.waveform-track';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  renderScriptAudio, pollAudioRender, listAudioLibrary, deleteAudioTrack,
  mirrorVoice, listVoiceLibrary, RenderStarted, AudioTrack, VoiceOption,
} from '@gitroom/frontend/components/studio/studio.voice-client';

const AUDIO_LIB_REFRESH = 'reinvestorhub:audio-library-refresh';
const fireRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUDIO_LIB_REFRESH)); };
const fireCreditsRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:credits-refresh')); };
const msg = (e: unknown) => (e as Error)?.message ?? String(e);

const Spinner: FC = () => (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
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

const cardCls = 'rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]';

// ── Unified render strip ───────────────────────────────────────────────────────
export const RenderStrip: FC<{ script: ScriptDoc }> = ({ script }) => {
  const { state, dispatch } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';
  const houseVoice = state.audioVoiceId;
  const setHouseVoice = (v: string) => dispatch({ type: 'SET_AUDIO_VOICE', voiceId: v });

  const cost = useMemo(() => estimateCost(script), [script]);
  const [busy, setBusy] = useState<null | 'dry' | 'real'>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [latest, setLatest] = useState<AudioTrack | null>(null);
  const [bound, setBound] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [renderedSig, setRenderedSig] = useState<string | null>(null);

  // Signature of everything the render depends on: line text/tone/direction/speaker + casting + house voice.
  const sig = useMemo(() => JSON.stringify({
    v: houseVoice,
    cast: script.cast.map((c) => [c.id, c.voice_id ?? '', c.default_tone]),
    b: script.beats.map((b) => b.lines.map((l) => [l.text, l.tone, l.direction, l.character_id])),
    p: script.pronunciation,
  }), [script, houseVoice]);
  const stale = !!latest && renderedSig !== null && renderedSig !== sig;

  // Load the latest rendered track for this script (survives navigation; also updates on a lib refresh).
  const loadLatest = useCallback(() => {
    listAudioLibrary(brandKitId)
      .then((r) => setLatest((r.tracks || [])
        .filter((t) => t.stage === 'rendered' && t.scriptId === script.script_id)
        .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0] || null))
      .catch(() => undefined);
  }, [brandKitId, script.script_id]);
  useEffect(() => { loadLatest(); }, [loadLatest]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => loadLatest();
    window.addEventListener(AUDIO_LIB_REFRESH, on);
    return () => window.removeEventListener(AUDIO_LIB_REFRESH, on);
  }, [loadLatest]);

  const dryRun = async () => {
    setBusy('dry'); setErr(null);
    try { await renderScriptAudio({ scriptId: script.script_id, brandKitId, voiceId: houseVoice, dryRun: true }); setRenderedSig(sig); loadLatest(); }
    catch (e) { setErr(msg(e)); } finally { setBusy(null); }
  };
  const render = async () => {
    setConfirming(false); setBusy('real'); setErr(null); setProgress({ done: 0, total: cost.lines });
    try {
      const started = (await renderScriptAudio({ scriptId: script.script_id, brandKitId, voiceId: houseVoice })) as RenderStarted;
      if (!started.jobId) throw new Error('Render did not start.');
      await pollAudioRender(started.jobId, setProgress);
      setRenderedSig(sig); loadLatest(); fireCreditsRefresh();
    } catch (e) { setErr(msg(e)); } finally { setBusy(null); setProgress(null); }
  };
  const assign = async () => {
    if (!latest) return;
    const adId = state.activeAdId;
    if (!adId) { setErr('Select an active ad first (Project bar above).'); return; }
    setErr(null);
    try { await addObject({ adId, type: 'audio', id: latest.id }); setBound(true); setTimeout(() => setBound(false), 2500); }
    catch (e) { setErr(msg(e)); }
  };
  const del = async () => {
    if (!latest) return; setConfirmDel(false);
    try { await deleteAudioTrack(latest.id); setLatest(null); setRenderedSig(null); loadLatest(); }
    catch (e) { setErr(msg(e)); }
  };

  const v = (latest?.voicesUsed || []).length;
  return (
    <div className={cardCls}>
      <div className="flex items-center gap-[10px] flex-wrap">
        <span className="text-[13px] font-[600] text-btnText">Voice-over</span>
        <span className="text-[11px] text-textItemBlur tabular-nums ml-auto">
          {cost.lines} line{cost.lines === 1 ? '' : 's'} · {cost.voices} voice{cost.voices === 1 ? '' : 's'} · ~{cost.credits} cr
        </span>
        <label className="flex items-center gap-[6px] text-[11px] font-[600] text-textItemBlur">House voice
          <StudioVoicePicker value={houseVoice} onChange={setHouseVoice} onError={setErr} />
        </label>
        <button type="button" onClick={dryRun} disabled={!!busy || !cost.lines}
          title="Free: stitch silent stubs to check casting + timing without spending credits"
          className="h-[40px] px-[12px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover disabled:opacity-40 inline-flex items-center gap-[6px]">
          {busy === 'dry' && <Spinner />}Dry run
        </button>
        <button type="button" onClick={() => setConfirming(true)} disabled={!!busy || !cost.lines}
          title="Render the script to audio — SPENDS TTS credits"
          className="h-[40px] px-[16px] rounded-[8px] bg-ai text-white font-[600] text-[13px] inline-flex items-center justify-center gap-[6px] disabled:opacity-50 disabled:cursor-not-allowed">
          {busy === 'real' && <Spinner />}
          {busy === 'real' && progress ? `Rendering ${progress.done}/${progress.total}…` : '⚡ Generate'}
        </button>
        <VoiceMirrorButton script={script} brandKitId={brandKitId} />
      </div>
      <span className="text-[11px] text-textItemBlur leading-[1.45]">Render the whole script to audio: each line in its cast voice + tone (delivery direction shapes the v3 performance); any uncast line uses the house voice. Cast voices per character in Cast.</span>

      {confirming && (
        <div className="flex items-center gap-[10px] rounded-[8px] border border-ai/40 bg-ai/10 px-[12px] py-[8px] text-[12px] text-btnText">
          <span className="flex-1">Render {cost.lines} line{cost.lines === 1 ? '' : 's'} in {cost.voices} voice{cost.voices === 1 ? '' : 's'}? This spends about <span className="font-[700]">{cost.credits} credits</span>.</span>
          <button type="button" onClick={render} className="h-[30px] px-[12px] rounded-[6px] bg-ai text-white font-[600]">Render</button>
          <button type="button" onClick={() => setConfirming(false)} className="h-[30px] px-[10px] rounded-[6px] border border-newBorder text-textItemBlur hover:text-btnText">Cancel</button>
        </div>
      )}

      {latest && (
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center gap-[8px] flex-wrap">
            {latest.dryRun && <span className="text-[10px] uppercase tracking-wide rounded-[4px] border border-newBorder px-[6px] py-[1px] text-textItemBlur">dry run</span>}
            <span className="text-[11px] text-textItemBlur tabular-nums">{latest.durationS ? `${latest.durationS}s` : ''}{v ? ` · ${v} voice${v === 1 ? '' : 's'}` : ''}</span>
            <span className="flex-1" />
            {latest.srtUrl && <a href={latest.srtUrl} download className="text-[11px] text-textItemBlur hover:text-btnText underline decoration-dotted">SRT</a>}
            {latest.vttUrl && <a href={latest.vttUrl} download className="text-[11px] text-textItemBlur hover:text-btnText underline decoration-dotted">VTT</a>}
            <button type="button" onClick={assign} disabled={!state.activeAdId}
              className={'h-[28px] px-[10px] rounded-[6px] border text-[11px] font-[600] ' + (bound ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText hover:bg-boxHover') + ' disabled:opacity-40'}
              title={state.activeAdId ? 'Use this track as the ad audio' : 'Select an active ad first'}>{bound ? '✓ Assigned' : '→ Ad'}</button>
            {confirmDel ? (
              <>
                <button type="button" onClick={del} className="h-[28px] px-[8px] rounded-[6px] bg-[#ff7eb6] text-[#3a0d23] font-[700] text-[11px]">Delete</button>
                <button type="button" onClick={() => setConfirmDel(false)} className="h-[28px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur">Cancel</button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="h-[28px] w-[28px] rounded-[6px] text-textItemBlur hover:text-btnText" title="Delete track">🗑</button>
            )}
          </div>
          <WaveformTrack url={latest.url} stale={stale} onError={setErr} />
          {stale && <span className="text-[11px] text-amber-400">Script or voice changed since this render. Regenerate to hear the latest.</span>}
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
        className="h-[40px] px-[12px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover inline-flex items-center gap-[6px]"
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
    } catch (e) { setErr(msg(e)); } finally { setBusy(false); }
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
