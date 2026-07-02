'use client';

// Synthetic-avatar gallery — the brand's registered talking avatars as cards. Each card casts the
// avatar with a script (→ a lip-synced clip saved to the Video Library), and manages the avatar
// (change voice, re-shoot the locked portrait, archive).
//
// Cast SPENDS (voice + lip-sync) → the Cast action confirms an estimate before firing. Re-shoot
// SPENDS one image → also confirmed. Voice change + archive are free. Postiz tokens, magenta bg-ai.

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  SynthAvatar,
  CastResult,
  AvatarEngine,
  listSynthAvatars,
  listAvatarEngines,
  setSynthEngine,
  castAndWait,
  reshootPortrait,
  setSynthVoice,
  archiveSynthAvatar,
} from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { listVoiceLibrary, VoiceOption } from '@gitroom/frontend/components/studio/studio.voice-client';

const AvatarCard: FC<{ avatar: SynthAvatar; engines: AvatarEngine[]; onChanged: () => void }> = ({ avatar, engines, onChanged }) => {
  const toaster = useToaster();
  const [script, setScript] = useState('');
  const [casting, setCasting] = useState(false);
  const [clip, setClip] = useState<CastResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [pickingVoice, setPickingVoice] = useState(false);

  const doCast = useCallback(async () => {
    if (!script.trim() || casting) return;
    const engineLabel = engines.find((x) => x.id === avatar.engine)?.label || avatar.engine;
    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Cast "${avatar.name}" saying this line?\n\nThis spends voice + lip-sync credits ` +
      `(engine: ${engineLabel}). The finished clip is saved to your Video Library.`
    );
    if (!ok) return;
    setCasting(true);
    setError(null);
    setClip(null);
    try {
      const r = await castAndWait({ synthId: avatar.synth_id, script: script.trim() });
      setClip(r);
      toaster.show(
        r.stub
          ? 'Cast ran in stub mode (no lip-sync key) — wired end to end, no real clip.'
          : `Clip ready (${r.engine}, ${r.durationS ? Math.round(r.durationS) + 's' : 'n/a'}) — saved to the Video Library.`,
        r.stub ? 'warning' : 'success'
      );
      onChanged();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setCasting(false);
    }
  }, [script, casting, avatar, engines, toaster, onChanged]);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); onChanged(); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [onChanged]);

  const doReshoot = useCallback(() => {
    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Re-shoot "${avatar.name}"'s portrait?\n\nThis regenerates and re-locks the soul portrait — a small Higgsfield spend.`
    );
    if (ok) run(() => reshootPortrait(avatar.synth_id, avatar.aspect_ratio));
  }, [avatar, run]);

  const openVoicePicker = useCallback(() => {
    setPickingVoice(true);
    if (!voices) listVoiceLibrary().then((v) => setVoices(v.filter((x) => x.ready))).catch(() => setVoices([]));
  }, [voices]);

  return (
    <div className="flex flex-col gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px]">
      <div className="flex items-start gap-[12px]">
        <div className="w-[56px] h-[56px] shrink-0 rounded-[8px] bg-newBgColor border border-newBorder overflow-hidden flex items-center justify-center text-textItemBlur text-[11px]">
          {avatar.portrait_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar.portrait_url} alt={avatar.name} className="w-full h-full object-cover" />
          ) : 'No image'}
        </div>
        <div className="flex flex-col gap-[3px] min-w-0 flex-1">
          <div className="flex items-center gap-[8px]">
            <span className="text-[14px] font-[600] text-btnText truncate">{avatar.name}</span>
            <span className="shrink-0 px-[8px] py-[2px] rounded-[6px] text-[10px] font-[600] uppercase tracking-[0.04em] bg-ai text-btnText">Synthetic</span>
          </div>
          <span className="text-[11px] text-textItemBlur">🔒 Soul-locked · {avatar.aspect_ratio}</span>
          <span className="text-[11px] text-textItemBlur truncate">Voice: {avatar.voice_label || avatar.voice_id}</span>
        </div>
      </div>

      {/* Model selector — HeyGen + fal.ai engines only */}
      <label className="flex items-center gap-[8px] text-[11px] text-textItemBlur">
        <span className="shrink-0">Model</span>
        <select
          value={avatar.engine}
          disabled={busy || casting}
          onChange={(e) => run(() => setSynthEngine(avatar.synth_id, e.target.value))}
          title={engines.find((x) => x.id === avatar.engine)?.note}
          className="flex-1 min-w-0 h-[30px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText disabled:opacity-50"
        >
          {engines.length === 0 && <option value={avatar.engine}>{avatar.engine}</option>}
          {engines.map((eng) => (
            <option key={eng.id} value={eng.id}>{eng.label} · {eng.vendor}</option>
          ))}
        </select>
      </label>

      {/* Cast */}
      <div className="flex flex-col gap-[8px]">
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Type a line for this avatar to say…"
          rows={2}
          className="w-full min-w-0 rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText p-[10px] resize-y leading-[1.4]"
        />
        <button
          type="button"
          disabled={!script.trim() || casting}
          onClick={doCast}
          className="h-[38px] px-[14px] rounded-[8px] bg-ai text-btnText font-[600] text-[12px] disabled:opacity-50"
        >
          {casting ? 'Casting… (this can take a minute)' : '🎬 Cast with this script'}
        </button>
      </div>

      {clip && !clip.stub && clip.clipUrl && (
        <div className="flex flex-col gap-[4px]">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={clip.clipUrl} controls className="w-full rounded-[8px] border border-newBorder bg-black" />
          <span className="text-[11px] text-textItemBlur">Saved to the Video Library ({clip.engine}).</span>
        </div>
      )}

      {error && <span className="text-[11px] text-red-400">{error}</span>}

      {/* Manage */}
      {pickingVoice ? (
        <div className="flex flex-col gap-[6px] max-h-[180px] overflow-y-auto pr-[4px]">
          {voices == null ? (
            <span className="text-[11px] text-textItemBlur">Loading voices…</span>
          ) : voices.map((v) => (
            <button
              key={v.voiceId}
              type="button"
              disabled={busy}
              onClick={() => run(() => setSynthVoice(avatar.synth_id, v.voiceId, v.label)).then(() => setPickingVoice(false))}
              className={clsx('flex items-center justify-between rounded-[8px] border p-[8px] text-left', v.voiceId === avatar.voice_id ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColor hover:border-ai/40')}
            >
              <span className="text-[12px] text-btnText truncate">{v.label}</span>
              {v.voiceId === avatar.voice_id && <span className="text-ai text-[11px]">current</span>}
            </button>
          ))}
          <button type="button" onClick={() => setPickingVoice(false)} className="h-[32px] rounded-[8px] bg-btnSimple text-btnText text-[11px]">Cancel</button>
        </div>
      ) : (
        <div className="flex items-center gap-[8px] text-[11px]">
          <button type="button" disabled={busy} onClick={openVoicePicker} className="h-[32px] px-[10px] rounded-[8px] bg-btnSimple text-btnText disabled:opacity-50">Change voice</button>
          <button type="button" disabled={busy} onClick={doReshoot} className="h-[32px] px-[10px] rounded-[8px] bg-btnSimple text-btnText disabled:opacity-50">Re-shoot portrait</button>
          <button type="button" disabled={busy} onClick={() => run(() => archiveSynthAvatar(avatar.synth_id))} className="h-[32px] px-[10px] rounded-[8px] border border-red-500/60 text-red-400 disabled:opacity-50">Archive</button>
        </div>
      )}
    </div>
  );
};

export const StudioSynthAvatarGallery: FC<{ brandKitId: string; reloadSignal?: number }> = ({ brandKitId, reloadSignal }) => {
  const [avatars, setAvatars] = useState<SynthAvatar[] | null>(null);
  const [engines, setEngines] = useState<AvatarEngine[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listAvatarEngines().then(setEngines).catch(() => setEngines([]));
  }, []);

  const load = useCallback(() => {
    setError(null);
    listSynthAvatars(brandKitId, 'active')
      .then((a) => setAvatars(a))
      .catch((e) => { setError((e as Error)?.message ?? String(e)); setAvatars([]); });
  }, [brandKitId]);

  useEffect(() => { load(); }, [load, reloadSignal]);
  // Agent-driven register/cast/archive fire this event (studio.capabilities) — keep the gallery live.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => load();
    window.addEventListener('reinvestorhub:synthavatar-refresh', on);
    return () => window.removeEventListener('reinvestorhub:synthavatar-refresh', on);
  }, [load]);

  if (error) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[16px] text-[13px] text-red-400">
        Could not load synthetic avatars: {error}{' '}
        <button type="button" onClick={load} className="underline text-btnText">Retry</button>
      </div>
    );
  }
  if (avatars == null) {
    return <div className="text-[13px] text-textItemBlur">Loading synthetic avatars…</div>;
  }
  if (avatars.length === 0) return null; // the panel renders the empty state

  return (
    <div className="flex flex-col gap-[10px]">
      <h3 className="text-[13px] font-[600] text-btnText">Synthetic avatars</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[12px]">
        {avatars.map((a) => (
          <AvatarCard key={a.synth_id} avatar={a} engines={engines} onChanged={load} />
        ))}
      </div>
    </div>
  );
};
