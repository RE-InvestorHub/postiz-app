'use client';

// Soundtrack assembly — the Plan 3 addition to the Writer's Room canvas. Two pieces the
// ScriptCanvas mounts below the Rendered tracks:
//   • AssembleBar — pick a music source (none · local bed · Jamendo search · AI-generate), toggle
//     duck + script SFX cues, optionally add library / AI SFX, then Assemble (FREE) → one master
//     track that folds the script's rendered VO + SFX + a ducked bed together.
//   • SoundtracksSection — the assembled masters for this script (stage:'mix'): waveform playback,
//     → Ad, delete.
//
// New file (merge-safe). Postiz tokens; magenta bg-ai only on AI (spend) actions; Jamendo shows a
// license chip + a commercial-use gate (a CC track is NOT ad-cleared without a Jamendo Licensing buy).

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { ScriptDoc } from '@gitroom/frontend/components/studio/studio.types';
import { WaveformTrack } from '@gitroom/frontend/components/studio/studio.waveform-track';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { listMusicBeds, MusicBed } from '@gitroom/frontend/components/studio/studio.music-client';
import { listAudioLibrary, deleteAudioTrack, AudioTrack } from '@gitroom/frontend/components/studio/studio.voice-client';
import {
  listSfxLibrary, generateSfx, searchJamendo, pickJamendo, generateMusic, assembleScript,
  SfxItem, JamendoTrack, AssembleSpec,
} from '@gitroom/frontend/components/studio/studio.assemble-client';

const AUDIO_LIB_REFRESH = 'reinvestorhub:audio-library-refresh';
const fireRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(AUDIO_LIB_REFRESH)); };
const fireCredits = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:credits-refresh')); };

const Spinner: FC = () => (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);
const tinySel = 'h-[30px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText';
const ghost = 'h-[30px] px-[10px] rounded-[6px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover disabled:opacity-40';

type MusicSource = 'none' | 'local' | 'jamendo' | 'elevenlabs';
interface SfxPlacement { key: string; label: string; sfxId?: string; assetId?: string; atS: number }

// ── Assemble bar ──────────────────────────────────────────────────────────────
export const AssembleBar: FC<{ script: ScriptDoc; brandKitId: string; grow?: boolean }> = ({ script, brandKitId, grow }) => {
  const [source, setSource] = useState<MusicSource>('local');
  const [beds, setBeds] = useState<MusicBed[]>([]);
  const [mood, setMood] = useState('calm');
  const [duck, setDuck] = useState(true);
  const [useCues, setUseCues] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Jamendo
  const [jq, setJq] = useState('');
  const [jResults, setJResults] = useState<JamendoTrack[] | null>(null);
  const [jConfigured, setJConfigured] = useState(true);
  const [jNote, setJNote] = useState<string | null>(null);
  const [pickedMusic, setPickedMusic] = useState<{ assetId: string; label: string; commercialUse: boolean; proLicensable: boolean } | null>(null);

  // AI music
  const [musicPrompt, setMusicPrompt] = useState('');
  const [confirmMusic, setConfirmMusic] = useState(false);

  // SFX
  const [sfxLib, setSfxLib] = useState<SfxItem[]>([]);
  const [placements, setPlacements] = useState<SfxPlacement[]>([]);
  const [sfxPrompt, setSfxPrompt] = useState('');
  const [confirmSfx, setConfirmSfx] = useState(false);

  useEffect(() => { listMusicBeds().then(setBeds).catch(() => undefined); listSfxLibrary().then((r) => setSfxLib(r.sfx)).catch(() => undefined); }, []);
  const moods = useMemo(() => Array.from(new Set(beds.map((b) => b.mood))), [beds]);

  const doJamendoSearch = async () => {
    setBusy('jsearch'); setErr(null);
    try {
      const r = await searchJamendo({ query: jq, limit: 12 });
      setJConfigured(r.configured); setJNote(r.note || null); setJResults(r.tracks || []);
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); }
  };
  const doPickJamendo = async (t: JamendoTrack) => {
    setBusy('jpick'); setErr(null);
    try {
      const r = await pickJamendo(t.jamendoId);
      setPickedMusic({ assetId: r.id, label: `${r.name} — ${r.artist}`, commercialUse: r.commercialUse, proLicensable: r.proLicensable });
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); }
  };
  const doGenMusic = async () => {
    setConfirmMusic(false); if (!musicPrompt.trim()) return;
    setBusy('genmusic'); setErr(null);
    try {
      const r = await generateMusic({ prompt: musicPrompt.trim(), lengthMs: 30000 });
      setPickedMusic({ assetId: r.id, label: `AI: ${musicPrompt.slice(0, 30)}`, commercialUse: true, proLicensable: true });
      fireCredits();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); }
  };
  const doGenSfx = async () => {
    setConfirmSfx(false); if (!sfxPrompt.trim()) return;
    setBusy('gensfx'); setErr(null);
    try {
      const r = await generateSfx({ text: sfxPrompt.trim(), durationSeconds: 3 });
      setPlacements((p) => [...p, { key: r.id, label: r.label || 'AI SFX', assetId: r.id, atS: 0 }]);
      setSfxPrompt(''); fireCredits();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); }
  };
  const addLibSfx = (s: SfxItem) => setPlacements((p) => [...p, { key: `${s.id}_${p.length}`, label: s.label, sfxId: s.id, atS: 0 }]);
  const setAt = (key: string, atS: number) => setPlacements((p) => p.map((x) => (x.key === key ? { ...x, atS } : x)));
  const removePlacement = (key: string) => setPlacements((p) => p.filter((x) => x.key !== key));

  const commercialBlocked = source === 'jamendo' && !!pickedMusic && !pickedMusic.commercialUse;

  const assemble = async () => {
    setBusy('assemble'); setErr(null);
    try {
      const music: AssembleSpec['music'] =
        source === 'local' ? { source: 'local', mood, duckRatio: duck ? 0.3 : 1 }
        : source === 'jamendo' && pickedMusic ? { source: 'jamendo', assetId: pickedMusic.assetId, duckRatio: duck ? 0.3 : 1 }
        : source === 'elevenlabs' && pickedMusic ? { source: 'elevenlabs', assetId: pickedMusic.assetId, duckRatio: duck ? 0.3 : 1 }
        : { source: 'none' };
      const spec: AssembleSpec = {
        music,
        sfx: { fromScriptCues: useCues, extra: placements.map((p) => ({ sfxId: p.sfxId, assetId: p.assetId, atS: p.atS })) },
      };
      await assembleScript({ scriptId: script.script_id, spec });
      fireRefresh();
    } catch (e) { setErr((e as Error)?.message ?? String(e)); } finally { setBusy(null); }
  };

  return (
    <div className={'rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[12px]' + (grow ? ' flex-1' : '')}>
      <div className="flex flex-col gap-[3px]">
        <span className="text-[13px] font-[600] text-btnText">Assemble soundtrack</span>
        <span className="text-[11px] text-textItemBlur leading-[1.45]">Fold this script&apos;s rendered voice-over + its SFX cues + a music bed (ducked under the speech) into one master track. Local ffmpeg — free.</span>
      </div>

      {/* Music source */}
      <div className="flex items-center gap-[8px] flex-wrap">
        <span className="text-[11px] font-[600] text-textItemBlur uppercase w-[52px]">Music</span>
        {(['none', 'local', 'jamendo', 'elevenlabs'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setSource(v)}
            className={'h-[30px] px-[10px] rounded-[6px] text-[12px] font-[600] border ' + (source === v ? 'border-ai bg-ai/10 text-btnText' : 'border-newBorder text-textItemBlur hover:text-btnText')}>
            {v === 'none' ? 'None' : v === 'local' ? 'Local beds' : v === 'jamendo' ? 'Jamendo' : '⚡ AI'}
          </button>
        ))}
        {source === 'local' && (
          <select value={mood} onChange={(e) => setMood(e.target.value)} className={tinySel} title="Music mood">
            {moods.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {source !== 'none' && (
          <label className="flex items-center gap-[5px] text-[12px] text-textItemBlur ml-[4px]">
            <input type="checkbox" checked={duck} onChange={(e) => setDuck(e.target.checked)} /> duck under VO
          </label>
        )}
      </div>

      {source === 'jamendo' && (
        <div className="flex flex-col gap-[8px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
          <div className="flex items-center gap-[8px]">
            <input value={jq} onChange={(e) => setJq(e.target.value)} placeholder="Search Jamendo (mood, genre, artist)…" onKeyDown={(e) => e.key === 'Enter' && doJamendoSearch()}
              className="flex-1 h-[30px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[12px] text-btnText" />
            <button type="button" onClick={doJamendoSearch} disabled={busy === 'jsearch'} className={ghost}>{busy === 'jsearch' ? <Spinner /> : 'Search'}</button>
          </div>
          {!jConfigured && <span className="text-[11px] text-amber-400">{jNote}</span>}
          {jResults && jResults.length === 0 && jConfigured && <span className="text-[11px] text-textItemBlur">No tracks found.</span>}
          {jResults && jResults.length > 0 && (
            <div className="flex flex-col gap-[4px] max-h-[180px] overflow-y-auto">
              {jResults.map((t) => (
                <div key={t.jamendoId} className="flex items-center gap-[8px] text-[12px]">
                  <span className="flex-1 min-w-0 truncate text-btnText">{t.name} <span className="text-textItemBlur">· {t.artist} · {Math.round(t.durationS)}s</span></span>
                  <span className="text-[10px] uppercase rounded-[4px] border border-newBorder px-[5px] py-[1px] text-textItemBlur" title={t.ccLicenseUrl || ''}>{t.commercialUse ? 'cleared' : 'CC · license for ads'}</span>
                  <button type="button" onClick={() => doPickJamendo(t)} disabled={busy === 'jpick'} className={ghost}>Use</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {source === 'elevenlabs' && (
        <div className="flex items-center gap-[8px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
          <input value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} placeholder="Describe the bed (e.g. warm corporate, gentle piano, hopeful)…"
            className="flex-1 h-[30px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[12px] text-btnText" />
          {confirmMusic ? (
            <>
              <button type="button" onClick={doGenMusic} disabled={busy === 'genmusic'} className="h-[30px] px-[10px] rounded-[6px] bg-ai text-white text-[12px] font-[600] inline-flex items-center gap-[6px]">{busy === 'genmusic' && <Spinner />}Spend ~450 cr</button>
              <button type="button" onClick={() => setConfirmMusic(false)} className={ghost}>Cancel</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmMusic(true)} disabled={!musicPrompt.trim()} className="h-[30px] px-[12px] rounded-[6px] bg-ai text-white text-[12px] font-[600] disabled:opacity-40">⚡ Generate 30s bed</button>
          )}
        </div>
      )}

      {source !== 'none' && pickedMusic && (
        <div className="flex items-center gap-[8px] text-[12px]">
          <span className="text-textItemBlur">Bed:</span><span className="text-btnText truncate">{pickedMusic.label}</span>
          {commercialBlocked && <span className="text-[11px] text-amber-400">— CC track: buy a Jamendo Licensing for commercial/ad use{pickedMusic.proLicensable ? '' : ' (not offered for this track)'}.</span>}
        </div>
      )}

      {/* SFX */}
      <div className="flex items-center gap-[8px] flex-wrap">
        <span className="text-[11px] font-[600] text-textItemBlur uppercase w-[52px]">SFX</span>
        <label className="flex items-center gap-[5px] text-[12px] text-textItemBlur">
          <input type="checkbox" checked={useCues} onChange={(e) => setUseCues(e.target.checked)} /> use script cues
        </label>
        {sfxLib.map((s) => (
          <button key={s.id} type="button" onClick={() => addLibSfx(s)} className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur hover:text-btnText" title={`Add ${s.label}`}>＋ {s.label}</button>
        ))}
      </div>
      <div className="flex items-center gap-[8px] flex-wrap">
        <input value={sfxPrompt} onChange={(e) => setSfxPrompt(e.target.value)} placeholder="AI SFX (e.g. cash register cha-ching)…"
          className="flex-1 min-w-[180px] h-[28px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText" />
        {confirmSfx ? (
          <>
            <button type="button" onClick={doGenSfx} disabled={busy === 'gensfx'} className="h-[28px] px-[10px] rounded-[6px] bg-ai text-white text-[12px] font-[600] inline-flex items-center gap-[6px]">{busy === 'gensfx' && <Spinner />}Spend ~200 cr</button>
            <button type="button" onClick={() => setConfirmSfx(false)} className={ghost}>Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmSfx(true)} disabled={!sfxPrompt.trim()} className="h-[28px] px-[10px] rounded-[6px] bg-ai text-white text-[12px] font-[600] disabled:opacity-40">⚡ AI SFX</button>
        )}
      </div>
      {placements.length > 0 && (
        <div className="flex flex-wrap gap-[6px]">
          {placements.map((p) => (
            <span key={p.key} className="inline-flex items-center gap-[5px] rounded-[6px] border border-newBorder bg-newBgColorInner px-[8px] py-[3px] text-[11px] text-btnText">
              {p.label} @
              <input type="number" min={0} step={0.5} value={p.atS} onChange={(e) => setAt(p.key, Math.max(0, Number(e.target.value) || 0))} className="w-[46px] h-[20px] px-[4px] rounded-[4px] bg-newBgColor border border-newBorder text-[11px]" />s
              <button type="button" onClick={() => removePlacement(p.key)} className="text-textItemBlur hover:text-btnText">✕</button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-[10px] mt-auto">
        <span className="text-[11px] text-textItemBlur">Free — needs a rendered voice-over above.</span>
        <button type="button" onClick={assemble} disabled={!!busy || commercialBlocked}
          title={commercialBlocked ? 'License this track for commercial use first, or pick a cleared source' : 'Assemble the master soundtrack (free)'}
          className="ml-auto h-[38px] px-[16px] rounded-[8px] bg-ai text-white font-[600] text-[13px] inline-flex items-center gap-[6px] disabled:opacity-50">
          {busy === 'assemble' && <Spinner />}{busy === 'assemble' ? 'Assembling…' : 'Assemble soundtrack'}
        </button>
      </div>
      {err && <div className="text-[12px] text-red-400 leading-[1.4]">{err}</div>}
    </div>
  );
};

// ── Assembled masters for this script ──────────────────────────────────────────
export const SoundtracksSection: FC<{ script: ScriptDoc; brandKitId: string; activeAdId: string | null }> = ({ script, brandKitId, activeAdId }) => {
  const [mixes, setMixes] = useState<AudioTrack[]>([]);
  const refresh = useCallback(() => {
    listAudioLibrary(brandKitId)
      .then((r) => setMixes((r.tracks || []).filter((t) => t.stage === 'mix' && t.scriptId === script.script_id)))
      .catch(() => undefined);
  }, [brandKitId, script.script_id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => refresh();
    window.addEventListener(AUDIO_LIB_REFRESH, on);
    return () => window.removeEventListener(AUDIO_LIB_REFRESH, on);
  }, [refresh]);

  if (!mixes.length) return null;
  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
      <span className="text-[13px] font-[600] text-btnText">Soundtracks</span>
      <div className="flex flex-col gap-[10px]">
        {mixes.map((m) => <MixCard key={m.id} mix={m} activeAdId={activeAdId} onChanged={refresh} />)}
      </div>
    </div>
  );
};

const MixCard: FC<{ mix: AudioTrack; activeAdId: string | null; onChanged: () => void }> = ({ mix, activeAdId, onChanged }) => {
  const [bound, setBound] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const assign = async () => {
    if (!activeAdId) { setErr('Select an active ad first.'); return; }
    setErr(null);
    try { await addObject({ adId: activeAdId, type: 'audio', id: mix.id }); setBound(true); setTimeout(() => setBound(false), 2500); }
    catch (e) { setErr((e as Error)?.message ?? String(e)); }
  };
  const del = async () => { setConfirmDel(false); try { await deleteAudioTrack(mix.id); onChanged(); } catch (e) { setErr((e as Error)?.message ?? String(e)); } };
  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] flex flex-col gap-[8px]">
      <div className="flex items-center gap-[8px] flex-wrap">
        <span className="text-[11px] text-textItemBlur tabular-nums">{mix.durationS ? `${mix.durationS}s` : ''} master</span>
        <span className="flex-1" />
        <button type="button" onClick={assign} disabled={!activeAdId}
          className={'h-[28px] px-[10px] rounded-[6px] border text-[11px] font-[600] ' + (bound ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText hover:bg-boxHover') + ' disabled:opacity-40'}
          title={activeAdId ? 'Use this soundtrack as the ad audio' : 'Select an active ad first'}>{bound ? '✓ Assigned' : '→ Ad'}</button>
        {confirmDel ? (
          <>
            <button type="button" onClick={del} className="h-[28px] px-[8px] rounded-[6px] bg-[#ff7eb6] text-[#3a0d23] font-[700] text-[11px]">Delete</button>
            <button type="button" onClick={() => setConfirmDel(false)} className="h-[28px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur">Cancel</button>
          </>
        ) : (
          <button type="button" onClick={() => setConfirmDel(true)} className="h-[28px] w-[28px] rounded-[6px] text-textItemBlur hover:text-btnText" title="Delete soundtrack">🗑</button>
        )}
      </div>
      <WaveformTrack url={mix.url} onError={setErr} />
      {err && <div className="text-[12px] text-red-400 leading-[1.4]">{err}</div>}
    </div>
  );
};
