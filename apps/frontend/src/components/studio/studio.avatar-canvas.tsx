'use client';

// Avatar canvas — the right-hand workspace for the selected avatar (Images/Video-style sidebar+canvas).
// Develop the lines, choose a voice source, and cast a talking-head clip. Focused: avatar + audio →
// clip (no backgrounds/captions/compositing — those live in the Scene Director / Video Editor).
//
// Four voice sources, all resolving to audio for the lip-sync engine:
//   ✍ Script → TTS in the avatar's voice   ·   🎙 Record (own voice or mirror)   ·   ⬆ inside record
//   📁 Writer's Room → a rendered single-speaker VO track
//
// Works for both kinds: synthetic (brand-owned, ai_generated) and human (consented, ai_clone). The
// brain applies the correct disclosure per source. Postiz tokens only; magenta bg-ai AI accent.

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CloneRecord } from '@gitroom/frontend/components/studio/studio.types';
import {
  SynthAvatar, AvatarEngine, castAndWait, setSynthEngine, reshootPortrait, deleteSynthAvatar,
} from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { castCloneAndWait, developAvatarLines, setCloneStatus, revokeClone } from '@gitroom/frontend/components/studio/studio.clone-client';
import { listAudioLibrary, AudioTrack } from '@gitroom/frontend/components/studio/studio.voice-client';
import { StudioAvatarRecordModal, RecordedAudio } from '@gitroom/frontend/components/studio/studio.avatar-record-modal';

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
// Portraits/reference images already carry the /api/brain prefix; a cast clip's publicUrl is a bare
// /assets/... path that needs it; engine clip URLs and blobs are absolute. Prefix only the bare case.
const assetUrl = (u?: string | null): string | null => {
  if (!u) return null;
  if (/^https?:|^blob:/.test(u) || u.startsWith(BRAIN_BASE)) return u;
  return `${BRAIN_BASE.replace(/\/+$/, '')}${u.startsWith('/') ? '' : '/'}${u}`;
};

const HUMAN_ENGINES = [
  { id: 'heygen', label: 'HeyGen Avatar IV' },
  { id: 'omnihuman', label: 'OmniHuman 1.5' },
  { id: 'kling', label: 'Kling v2 Pro' },
];

type Kind = 'synthetic' | 'human';
type PickedAudio = RecordedAudio | { assetId: string; url: string; label: string; mirrored?: boolean };

export const StudioAvatarCanvas: FC<{
  kind: Kind;
  record: SynthAvatar | CloneRecord;
  engines: AvatarEngine[];
  brandKitId: string;
  onChanged: () => void;
}> = ({ kind, record, engines, brandKitId, onChanged }) => {
  const isHuman = kind === 'human';
  const human = record as CloneRecord;
  const synth = record as SynthAvatar;

  // ---- normalized display fields ----
  const id = isHuman ? human.clone_id : synth.synth_id;
  const name = isHuman ? human.person : synth.name;
  const portraitUrl = assetUrl(isHuman ? human.visual_identity?.reference_images?.[0] : synth.portrait_url);
  const voiceId = isHuman ? human.voice?.voice_id : synth.voice_id;
  const voiceLabel = isHuman ? human.voice?.voice_id : (synth.voice_label || synth.voice_id);
  const castable = isHuman
    ? (human.status === 'active' && !!human.visual_identity?.soul_id && human.prep_status !== 'training')
    : (synth.status === 'active');
  const engineOpts = isHuman ? HUMAN_ENGINES : engines.map((e) => ({ id: e.id, label: `${e.label} · ${e.vendor}` }));

  // ---- state ----
  const [engine, setEngine] = useState<string>(isHuman ? 'heygen' : (synth.engine || 'heygen'));
  const [source, setSource] = useState<'script' | 'record' | 'library'>('script');
  const [script, setScript] = useState('');
  const [audio, setAudio] = useState<PickedAudio | null>(null);
  const [showRecord, setShowRecord] = useState(false);
  const [developing, setDeveloping] = useState(false);
  const [tracks, setTracks] = useState<AudioTrack[] | null>(null);
  const [casting, setCasting] = useState(false);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); // lifecycle actions

  // Reset the workspace when the selected avatar changes.
  useEffect(() => {
    setSource('script'); setScript(''); setAudio(null); setClipUrl(null); setMsg(null); setError(null);
    setEngine(isHuman ? 'heygen' : (synth.engine || 'heygen'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const readyToCast = source === 'script' ? !!script.trim() : !!audio;

  const develop = useCallback(async () => {
    if (!script.trim()) { setError('Type a topic or a rough line first, then Develop.'); return; }
    setDeveloping(true); setError(null);
    try {
      const r = await developAvatarLines({ prompt: script.trim(), avatarName: name, brandKitId, existing: script.trim() });
      if (r.lines) setScript(r.lines);
    } catch (e) { setError((e as Error)?.message ?? 'Develop failed'); }
    finally { setDeveloping(false); }
  }, [script, name, brandKitId]);

  const openLibrary = useCallback(() => {
    setSource('library');
    if (tracks == null) listAudioLibrary(brandKitId, { singleSpeaker: true }).then((r) => setTracks(r.tracks || [])).catch(() => setTracks([]));
  }, [tracks, brandKitId]);

  const cast = useCallback(async () => {
    setCasting(true); setError(null); setMsg(null); setClipUrl(null);
    try {
      const audioParams = source !== 'script' && audio ? { audioAssetId: audio.assetId } : {};
      const scriptParams = source === 'script' ? { script: script.trim() } : {};
      if (isHuman) {
        const job = await castCloneAndWait({ cloneId: id, engine, ...scriptParams, ...audioParams });
        if (job.status === 'done') { setClipUrl(assetUrl(job.result?.publicUrl)); setMsg(job.result?.stub ? 'Cast complete (stub clip).' : 'Clip added to the Video Library.'); }
        else { setError(job.error || 'Cast failed'); }
      } else {
        const r = await castAndWait({ synthId: id, engine, ...scriptParams, ...audioParams });
        setClipUrl(assetUrl(r.clipUrl)); setMsg(r.stub ? 'Cast complete (stub clip).' : 'Clip added to the Video Library.');
      }
      onChanged();
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setCasting(false); }
  }, [source, audio, script, isHuman, id, engine, onChanged]);

  const runLifecycle = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [onChanged]);

  const selectCls = 'h-[32px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText';

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Header */}
      <div className="flex items-center gap-[10px]">
        <span className="text-[15px] font-[600] text-btnText truncate">{name}</span>
        <span className={clsx('shrink-0 px-[8px] py-[2px] rounded-[6px] text-[10px] font-[600] uppercase tracking-[0.04em]', isHuman ? 'bg-blue-500 text-white' : 'bg-ai text-btnText')}>
          {isHuman ? 'Human' : 'Synthetic'}
        </span>
        {isHuman && human.visual_identity?.soul_id && <span className="text-[11px] text-textItemBlur">🔒 Soul-locked</span>}
      </div>

      <div className="flex flex-col lg:flex-row gap-[14px]">
        {/* Preview */}
        <div className="lg:w-[300px] shrink-0 flex flex-col gap-[8px]">
          <div className="aspect-[3/4] rounded-[8px] border border-newBorder bg-newBgColor overflow-hidden flex items-center justify-center">
            {clipUrl ? (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video src={clipUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
            ) : portraitUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={portraitUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <span className="text-[12px] text-textItemBlur">No portrait</span>
            )}
          </div>
          <span className="text-[11px] text-textItemBlur leading-[1.4]">
            {clipUrl ? 'Latest cast — also saved to the Video Library.' : 'The rendered clip will play here after you cast.'}
          </span>
        </div>

        {/* Workspace */}
        <div className="flex-1 min-w-0 flex flex-col gap-[12px]">
          {!castable ? (
            <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] text-[12px] text-textItemBlur leading-[1.5]">
              {isHuman && human.prep_status === 'training'
                ? 'This avatar is still preparing — training the Soul. It becomes castable once it finishes.'
                : isHuman && !human.visual_identity?.soul_id
                ? 'This avatar has no trained Soul yet, so it can’t be cast. Re-create it with the current wizard to train one.'
                : `This avatar is ${isHuman ? human.status : synth.status} — reactivate it to cast.`}
            </div>
          ) : (
            <>
              {/* Voice source */}
              <div className="flex flex-col gap-[8px]">
                <div className="inline-flex rounded-[8px] border border-newBorder overflow-hidden self-start">
                  {([['script', '✍ Script'], ['record', '🎙 Record'], ['library', '📁 Writer’s Room']] as const).map(([k, lbl]) => (
                    <button key={k} type="button"
                      onClick={() => { if (k === 'record') { setSource('record'); setShowRecord(true); } else if (k === 'library') { openLibrary(); } else { setSource('script'); } }}
                      className={clsx('h-[32px] px-[12px] text-[12px] font-[600]', source === k ? 'bg-btnPrimary text-btnText' : 'text-textItemBlur hover:text-btnText')}>
                      {lbl}
                    </button>
                  ))}
                </div>

                {source === 'script' && (
                  <div className="flex flex-col gap-[8px]">
                    <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={5}
                      placeholder={`What should ${name} say? Type the lines, or a topic + ✨ Develop.`}
                      className="w-full rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText p-[12px] resize-y leading-[1.5]" />
                    <div className="flex items-center gap-[10px]">
                      <button type="button" onClick={develop} disabled={developing || !script.trim()}
                        className="h-[34px] px-[12px] rounded-[8px] border border-ai/60 text-ai text-[12px] font-[700] hover:bg-ai/10 disabled:opacity-50 inline-flex items-center gap-[7px]">
                        {developing && <span className="inline-block w-[12px] h-[12px] rounded-full border-2 border-ai border-t-transparent animate-spin" aria-hidden="true" />}
                        ✨ Develop with AI
                      </button>
                      <span className="text-[11px] text-textItemBlur">{script.trim() ? `${script.trim().split(/\s+/).length} words · ~${Math.round(script.trim().split(/\s+/).length / 2.6)}s` : 'Spoken in the avatar’s voice (TTS).'}</span>
                    </div>
                  </div>
                )}

                {source === 'record' && (
                  <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[12px] text-[12px] text-textItemBlur flex items-center justify-between gap-[10px]">
                    <span>{audio ? `Using: ${audio.label}` : 'Record or upload a clip to drive the lip-sync.'}</span>
                    <button type="button" onClick={() => setShowRecord(true)} className="h-[30px] px-[10px] rounded-[8px] bg-btnSimple text-btnText text-[12px]">{audio ? 'Re-record' : '🎙 Record / Upload'}</button>
                  </div>
                )}

                {source === 'library' && (
                  <div className="flex flex-col gap-[6px]">
                    {tracks == null ? (
                      <span className="text-[12px] text-textItemBlur">Loading your Writer’s Room tracks…</span>
                    ) : tracks.length === 0 ? (
                      <span className="text-[12px] text-textItemBlur">No single-speaker VO tracks yet — render one in the Audio tab’s Writer’s Room.</span>
                    ) : (
                      <select className={selectCls + ' w-full'} value={(audio && 'assetId' in audio) ? audio.assetId : ''}
                        onChange={(e) => { const t = tracks.find((x) => x.id === e.target.value); setAudio(t ? { assetId: t.id, url: t.url, label: t.scriptName || t.text?.slice(0, 40) || t.id } : null); }}>
                        <option value="">— Pick a VO track —</option>
                        {tracks.map((t) => <option key={t.id} value={t.id}>{(t.scriptName || t.text?.slice(0, 50) || t.id)}{t.durationS ? ` · ${Math.round(t.durationS)}s` : ''}</option>)}
                      </select>
                    )}
                    <span className="text-[11px] text-textItemBlur">One face = one voice — only single-speaker tracks are shown.</span>
                  </div>
                )}
              </div>

              {/* Model + Cast */}
              <div className="flex flex-col gap-[8px] rounded-[8px] border border-newBorder bg-newBgColor p-[12px]">
                <label className="flex items-center gap-[8px] text-[11px] text-textItemBlur">
                  <span className="shrink-0">Model</span>
                  <select value={engine} disabled={casting} onChange={(e) => { setEngine(e.target.value); if (!isHuman) runLifecycle(() => setSynthEngine(synth.synth_id, e.target.value)); }}
                    className="flex-1 min-w-0 h-[30px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText disabled:opacity-50">
                    {engineOpts.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select>
                </label>
                <button type="button" disabled={!readyToCast || casting} onClick={cast}
                  className="h-[40px] px-[16px] rounded-[8px] bg-ai text-btnText font-[700] text-[13px] disabled:opacity-50 inline-flex items-center justify-center gap-[8px]">
                  {casting && <span className="inline-block w-[14px] h-[14px] rounded-full border-2 border-btnText/40 border-t-btnText animate-spin" aria-hidden="true" />}
                  {casting ? 'Generating video…' : '🎬 Cast into video'}
                </button>
                {msg && <span className="text-[11px] text-textItemBlur">{msg}</span>}
              </div>
            </>
          )}

          {error && <span className="text-[12px] text-red-400">{error}</span>}

          {/* Lifecycle */}
          <div className="flex items-center gap-[8px] flex-wrap pt-[2px]">
            {isHuman ? (
              <>
                {human.status === 'active' ? (
                  <button type="button" disabled={busy} onClick={() => runLifecycle(() => setCloneStatus(human.clone_id, 'suspended'))} className="h-[32px] px-[10px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50">Suspend</button>
                ) : human.status === 'suspended' ? (
                  <button type="button" disabled={busy} onClick={() => runLifecycle(() => setCloneStatus(human.clone_id, 'active'))} className="h-[32px] px-[10px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50">Reactivate</button>
                ) : null}
                {human.status !== 'revoked' && (
                  <button type="button" disabled={busy} onClick={() => { const r = typeof window !== 'undefined' ? window.prompt('Reason for revoking (recorded):') : ''; if (r != null) runLifecycle(() => revokeClone(human.clone_id, r || 'Revoked via Studio')); }} className="h-[32px] px-[10px] rounded-[8px] border border-red-500/60 text-red-400 text-[12px] disabled:opacity-50">Revoke</button>
                )}
                {human.consent_expires && <span className="text-[11px] text-textItemBlur">Consent: {human.consent_expires}</span>}
              </>
            ) : (
              <>
                <button type="button" disabled={busy} onClick={() => { if (typeof window === 'undefined' || window.confirm(`Re-shoot ${synth.name}'s portrait? Small Higgsfield spend.`)) runLifecycle(() => reshootPortrait(synth.synth_id, synth.aspect_ratio)); }} className="h-[32px] px-[10px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50">Re-shoot portrait</button>
                <button type="button" disabled={busy} onClick={() => { if (typeof window === 'undefined' || window.confirm(`Permanently delete ${synth.name}? Clips already in the Video Library are kept.`)) runLifecycle(() => deleteSynthAvatar(synth.synth_id)); }} className="h-[32px] px-[10px] rounded-[8px] border border-red-500/60 text-red-400 text-[12px] disabled:opacity-50">Delete</button>
              </>
            )}
          </div>
        </div>
      </div>

      {showRecord && (
        <StudioAvatarRecordModal
          voiceId={voiceId}
          voiceLabel={voiceLabel}
          brandKitId={brandKitId}
          onClose={() => setShowRecord(false)}
          onDone={(a) => { setAudio(a); setSource('record'); setShowRecord(false); }}
        />
      )}
    </div>
  );
};
