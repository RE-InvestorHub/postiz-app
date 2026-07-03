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
  deleteSynthAvatar,
} from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { listVoiceLibrary, VoiceOption } from '@gitroom/frontend/components/studio/studio.voice-client';
import { AvatarReadyCard } from '@gitroom/frontend/components/studio/studio.avatar-ready-card';

const AvatarCard: FC<{ avatar: SynthAvatar; engines: AvatarEngine[]; onChanged: () => void; selectMode?: boolean; isSelected?: boolean; onToggleSelect?: () => void }> = ({ avatar, engines, onChanged, selectMode, isSelected, onToggleSelect }) => {
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
    <AvatarReadyCard
      kind="synthetic"
      name={avatar.name}
      thumbUrl={avatar.portrait_url}
      selectMode={selectMode}
      isSelected={isSelected}
      onToggleSelect={onToggleSelect}
      badges={<span className="shrink-0 px-[8px] py-[2px] rounded-[6px] text-[10px] font-[600] uppercase tracking-[0.04em] bg-ai text-btnText">Synthetic</span>}
      subheading={<span className="text-[11px] text-textItemBlur">🔒 Soul-locked · {avatar.aspect_ratio}</span>}
      meta={<span className="text-[11px] text-textItemBlur truncate">Voice: {avatar.voice_label || avatar.voice_id}</span>}
      castable
      engines={engines.map((e) => ({ id: e.id, label: `${e.label} · ${e.vendor}` }))}
      engineValue={avatar.engine}
      onEngineChange={(id) => run(() => setSynthEngine(avatar.synth_id, id))}
      engineDisabled={busy || casting}
      script={script}
      onScriptChange={setScript}
      casting={casting}
      castLabel="🎬 Cast with this script"
      castingLabel="Casting…"
      onCast={doCast}
      belowCast={clip && !clip.stub && clip.clipUrl ? (
        <div className="flex flex-col gap-[4px]">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video src={clip.clipUrl} controls className="w-full rounded-[8px] border border-newBorder bg-black" />
          <span className="text-[11px] text-textItemBlur">Saved to the Video Library ({clip.engine}).</span>
        </div>
      ) : null}
      error={error}
      actions={
        pickingVoice ? (
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
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const ok = typeof window === 'undefined' ? true : window.confirm(
                  `Permanently delete "${avatar.name}"?\n\nThis removes the avatar and its portrait. Any clips already cast and saved to the Video Library are kept. This cannot be undone.`
                );
                if (ok) run(() => deleteSynthAvatar(avatar.synth_id));
              }}
              className="h-[32px] px-[10px] rounded-[8px] border border-red-500/60 text-red-400 disabled:opacity-50"
            >
              Delete
            </button>
          </div>
        )
      }
    />
  );
};

export const StudioSynthAvatarGallery: FC<{
  brandKitId: string;
  reloadSignal?: number;
  hideHeading?: boolean;
  selectMode?: boolean;
  isSelected?: (id: string) => boolean;
  onToggleSelect?: (id: string) => void;
}> = ({ brandKitId, reloadSignal, hideHeading, selectMode, isSelected, onToggleSelect }) => {
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
      {!hideHeading && <h3 className="text-[13px] font-[600] text-btnText">Synthetic avatars</h3>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[12px]">
        {avatars.map((a) => (
          <AvatarCard
            key={a.synth_id}
            avatar={a}
            engines={engines}
            onChanged={load}
            selectMode={selectMode}
            isSelected={!!isSelected?.(a.synth_id)}
            onToggleSelect={() => onToggleSelect?.(a.synth_id)}
          />
        ))}
      </div>
    </div>
  );
};
