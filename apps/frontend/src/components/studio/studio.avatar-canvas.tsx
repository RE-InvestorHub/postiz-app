'use client';

// Avatar canvas — the HeyGen-style workspace for the selected avatar: a dialog/lines column on the
// LEFT and a big avatar canvas on the RIGHT, with a background-selector bar across the top of the
// canvas. Develop the lines, pick a backdrop (instant preview), and cast a talking-head clip. Focused:
// avatar + audio → clip (no compositing beyond the backdrop swap — that stays in Scene Director / Editor).
//
// Voice sources → the lip-sync engine: ✍ Script→TTS · 🎙 Record (own voice or mirror) · ⬆ Upload ·
// 📁 Writer's Room. Background swap = matte the portrait once (rembg, free) → composite a backdrop
// behind it; previewed instantly client-side, baked server-side at cast time. Postiz tokens; bg-ai accent.

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { CloneRecord } from '@gitroom/frontend/components/studio/studio.types';
import {
  SynthAvatar, AvatarEngine, castAndWait, setSynthEngine, reshootPortrait, deleteSynthAvatar,
} from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { castCloneAndWait, developAvatarLines, setCloneStatus, revokeClone, matteAvatar, AvatarBackground } from '@gitroom/frontend/components/studio/studio.clone-client';
import { listAudioLibrary, AudioTrack } from '@gitroom/frontend/components/studio/studio.voice-client';
import { listBrandImages, BrandImage } from '@gitroom/frontend/components/studio/studio.image-client';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import { StudioAvatarRecordModal, RecordedAudio } from '@gitroom/frontend/components/studio/studio.avatar-record-modal';

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
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

// Backdrop presets (solid + gradient). No spend; instant preview.
type BgChoice = (AvatarBackground & { label: string; previewUrl?: string }) | null;
const BG_PRESETS: (AvatarBackground & { label: string })[] = [
  { label: 'Studio grey', type: 'color', color: '#2b2f36' },
  { label: 'Slate', type: 'gradient', colors: ['#334155', '#0f172a'] },
  { label: 'Navy', type: 'color', color: '#0b1e3f' },
  { label: 'Warm', type: 'gradient', colors: ['#7c2d12', '#111827'] },
  { label: 'Sky', type: 'gradient', colors: ['#0ea5e9', '#1e3a8a'] },
  { label: 'Green screen', type: 'color', color: '#00b140' },
];

function bgStyle(bg: BgChoice): React.CSSProperties {
  if (!bg) return {};
  if (bg.type === 'image') return { backgroundImage: `url(${assetUrl(bg.previewUrl || bg.imageUrl)})`, backgroundSize: 'cover', backgroundPosition: 'center' };
  if (bg.type === 'gradient') { const [a, b] = bg.colors || ['#1f2937', '#111827']; return { background: `linear-gradient(160deg, ${a}, ${b})` }; }
  return { background: bg.color || '#111827' };
}

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

  const id = isHuman ? human.clone_id : synth.synth_id;
  const name = isHuman ? human.person : synth.name;
  const portraitUrl = assetUrl(isHuman ? human.visual_identity?.reference_images?.[0] : synth.portrait_url);
  const voiceId = isHuman ? human.voice?.voice_id : synth.voice_id;
  const voiceLabel = isHuman ? human.voice?.voice_id : (synth.voice_label || synth.voice_id);
  const castable = isHuman
    ? (human.status === 'active' && !!human.visual_identity?.soul_id && human.prep_status !== 'training')
    : (synth.status === 'active');
  const engineOpts = isHuman ? HUMAN_ENGINES : engines.map((e) => ({ id: e.id, label: `${e.label} · ${e.vendor}` }));

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
  const [busy, setBusy] = useState(false);

  // Background swap
  const [bg, setBg] = useState<BgChoice>(null);
  const [matteUrl, setMatteUrl] = useState<string | null>(null);
  const [matting, setMatting] = useState(false);
  const [bgImages, setBgImages] = useState<BrandImage[] | null>(null);

  // Reset when the selected avatar changes.
  useEffect(() => {
    setSource('script'); setScript(''); setAudio(null); setClipUrl(null); setMsg(null); setError(null);
    setBg(null); setMatteUrl(null);
    setEngine(isHuman ? 'heygen' : (synth.engine || 'heygen'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const readyToCast = source === 'script' ? !!script.trim() : !!audio;

  // Fetch the matte once when the user first applies a background (rembg, free).
  const ensureMatte = useCallback(async () => {
    if (matteUrl || matting) return;
    setMatting(true);
    try { const r = await matteAvatar(kind, id); setMatteUrl(assetUrl(r.matteUrl)); }
    catch (e) { setError((e as Error)?.message ?? 'Could not prepare the background preview'); }
    finally { setMatting(false); }
  }, [matteUrl, matting, kind, id]);

  const applyBg = useCallback((b: BgChoice) => { setBg(b); if (b) void ensureMatte(); }, [ensureMatte]);

  const openBgLibrary = useCallback(() => {
    if (bgImages == null) listBrandImages(brandKitId).then(setBgImages).catch(() => setBgImages([]));
  }, [bgImages, brandKitId]);

  const uploadBg = useCallback(async (file: File) => {
    setError(null);
    try { const a = await uploadFileToBrain(file); applyBg({ label: 'Uploaded', type: 'image', imageAssetId: a.assetId, previewUrl: a.url }); }
    catch (e) { setError((e as Error)?.message ?? 'Upload failed'); }
  }, [applyBg]);

  const develop = useCallback(async () => {
    if (!script.trim()) { setError('Type a topic or a rough line first, then Develop.'); return; }
    setDeveloping(true); setError(null);
    try { const r = await developAvatarLines({ prompt: script.trim(), avatarName: name, brandKitId, existing: script.trim() }); if (r.lines) setScript(r.lines); }
    catch (e) { setError((e as Error)?.message ?? 'Develop failed'); }
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
      const bgParam = bg ? { background: { type: bg.type, color: bg.color, colors: bg.colors, imageAssetId: bg.imageAssetId, imageUrl: bg.imageUrl } } : {};
      if (isHuman) {
        const job = await castCloneAndWait({ cloneId: id, engine, ...scriptParams, ...audioParams, ...bgParam });
        if (job.status === 'done') { setClipUrl(assetUrl(job.result?.publicUrl)); setMsg(job.result?.stub ? 'Cast complete (stub clip).' : 'Clip added to the Video Library.'); }
        else { setError(job.error || 'Cast failed'); }
      } else {
        const r = await castAndWait({ synthId: id, engine, ...scriptParams, ...audioParams, ...bgParam });
        setClipUrl(assetUrl(r.clipUrl)); setMsg(r.stub ? 'Cast complete (stub clip).' : 'Clip added to the Video Library.');
      }
      onChanged();
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setCasting(false); }
  }, [source, audio, script, bg, isHuman, id, engine, onChanged]);

  const runLifecycle = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [onChanged]);

  const selectCls = 'h-[32px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText';
  const swatch = 'w-[26px] h-[26px] rounded-[6px] border border-newBorder shrink-0';

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Header */}
      <div className="flex items-center gap-[10px]">
        <span className="text-[15px] font-[600] text-btnText truncate">{name}</span>
        <span className={clsx('shrink-0 px-[8px] py-[2px] rounded-[6px] text-[10px] font-[600] uppercase tracking-[0.04em]', isHuman ? 'bg-blue-500 text-white' : 'bg-ai text-btnText')}>
          {isHuman ? 'Human' : 'Synthetic'}
        </span>
        {isHuman && human.visual_identity?.soul_id && <span className="text-[11px] text-textItemBlur">🔒 Soul-locked</span>}
      </div>

      {!castable ? (
        <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] text-[12px] text-textItemBlur leading-[1.5]">
          {isHuman && human.prep_status === 'training'
            ? 'This avatar is still preparing — training the Soul. It becomes castable once it finishes.'
            : isHuman && !human.visual_identity?.soul_id
            ? 'This avatar has no trained Soul yet, so it can’t be cast. Re-create it with the current wizard to train one.'
            : `This avatar is ${isHuman ? human.status : synth.status} — reactivate it to cast.`}
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-[14px]">
          {/* LEFT — dialog / lines + controls */}
          <div className="lg:w-[340px] shrink-0 flex flex-col gap-[12px]">
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
                <textarea value={script} onChange={(e) => setScript(e.target.value)} rows={8}
                  placeholder={`What should ${name} say? Type the lines, or a topic + ✨ Develop.`}
                  className="w-full rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText p-[12px] resize-y leading-[1.5]" />
                <div className="flex items-center gap-[10px] flex-wrap">
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

            {error && <span className="text-[12px] text-red-400">{error}</span>}

            {/* Lifecycle */}
            <div className="flex items-center gap-[8px] flex-wrap">
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
                </>
              ) : (
                <>
                  <button type="button" disabled={busy} onClick={() => { if (typeof window === 'undefined' || window.confirm(`Re-shoot ${synth.name}'s portrait? Small Higgsfield spend.`)) runLifecycle(() => reshootPortrait(synth.synth_id, synth.aspect_ratio)); }} className="h-[32px] px-[10px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50">Re-shoot portrait</button>
                  <button type="button" disabled={busy} onClick={() => { if (typeof window === 'undefined' || window.confirm(`Permanently delete ${synth.name}? Clips already in the Video Library are kept.`)) runLifecycle(() => deleteSynthAvatar(synth.synth_id)); }} className="h-[32px] px-[10px] rounded-[8px] border border-red-500/60 text-red-400 text-[12px] disabled:opacity-50">Delete</button>
                </>
              )}
            </div>
          </div>

          {/* RIGHT — background bar + big canvas */}
          <div className="flex-1 min-w-0 flex flex-col gap-[8px]">
            {/* Background selector bar */}
            <div className="flex items-center gap-[8px] flex-wrap rounded-[8px] border border-newBorder bg-newBgColor px-[10px] py-[8px]">
              <span className="text-[11px] font-[600] text-textItemBlur shrink-0">Background</span>
              <button type="button" onClick={() => applyBg(null)} title="Original portrait" className={clsx(swatch, 'flex items-center justify-center text-[10px] text-textItemBlur', !bg && 'ring-2 ring-ai')}>None</button>
              {BG_PRESETS.map((p) => (
                <button key={p.label} type="button" title={p.label} onClick={() => applyBg({ ...p })}
                  className={clsx(swatch, bg && bg.label === p.label && 'ring-2 ring-ai')} style={bgStyle({ ...p } as BgChoice)} />
              ))}
              <label className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-btnText flex items-center gap-[4px] cursor-pointer hover:border-ai/50">
                ⬆ Upload
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadBg(f); e.target.value = ''; }} />
              </label>
              <div className="relative">
                <button type="button" onClick={openBgLibrary} className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-btnText hover:border-ai/50">📁 Library</button>
              </div>
              {bgImages && bgImages.length > 0 && (
                <select className="h-[26px] px-[6px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[11px] text-btnText max-w-[160px]"
                  value={bg?.type === 'image' && bg.imageAssetId ? bg.imageAssetId : ''}
                  onChange={(e) => { const im = bgImages.find((x) => x.id === e.target.value); if (im) applyBg({ label: 'Library', type: 'image', imageAssetId: im.id, previewUrl: im.url }); }}>
                  <option value="">— brand image —</option>
                  {bgImages.map((im) => <option key={im.id} value={im.id}>{im.id.slice(0, 22)}</option>)}
                </select>
              )}
              {matting && <span className="text-[11px] text-ai inline-flex items-center gap-[6px]"><span className="inline-block w-[11px] h-[11px] rounded-full border-2 border-ai border-t-transparent animate-spin" />preparing…</span>}
            </div>

            {/* Big canvas */}
            <div className="flex-1 min-h-[360px] rounded-[8px] border border-newBorder bg-newBgColor overflow-hidden flex items-center justify-center">
              {clipUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={clipUrl} controls autoPlay className="w-full h-full object-contain bg-black" />
              ) : bg && matteUrl ? (
                <div className="relative w-full h-full" style={bgStyle(bg)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={matteUrl} alt={name} className="absolute inset-0 w-full h-full object-contain" />
                </div>
              ) : portraitUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portraitUrl} alt={name} className="w-full h-full object-contain" />
              ) : (
                <span className="text-[12px] text-textItemBlur">No portrait</span>
              )}
            </div>
            <span className="text-[11px] text-textItemBlur leading-[1.4]">
              {clipUrl ? 'Latest cast — also saved to the Video Library.' : bg ? 'Preview — the backdrop is baked into the clip when you cast.' : 'The rendered clip will play here after you cast.'}
            </span>
          </div>
        </div>
      )}

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
