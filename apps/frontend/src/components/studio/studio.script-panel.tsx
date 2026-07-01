'use client';

// Writer's Room — the ✍ sub-view of the Audio tab (Plan 1b). Laid out like the Images/Video tabs:
// a left SCRIPTS SIDEBAR (the brand's saved scripts, always visible) + a right CANVAS for the
// selected script. The canvas is the writer's-room proper: a script-driven VO preview strip (T3),
// a live words/seconds budget meter, hook variants, cast, time-budgeted beats with per-line
// dialogue/direction, and pronunciation overrides. Every edit returns the full ScriptDoc →
// SET_ACTIVE_SCRIPT (the agent + the panel share this lever). The former ▦ Library sub-view is gone;
// audio uploads live behind the sidebar's ⬆ button and the active ad's audio cascades in below.
// Postiz tokens only.

import { FC, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { ScriptDoc, ScriptBeat, ScriptLine, SCRIPT_TONES, TONE_LABELS, ScriptTone } from '@gitroom/frontend/components/studio/studio.types';
import * as sc from '@gitroom/frontend/components/studio/studio.script-client';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { StudioAdAssetShelf } from '@gitroom/frontend/components/studio/studio.ad-asset-shelf';
import { StudioVoicePicker } from '@gitroom/frontend/components/studio/studio.voice-picker';
import { generateVOFromScript, latestVOForScript } from '@gitroom/frontend/components/studio/studio.voice-client';
import { WaveformTrack } from '@gitroom/frontend/components/studio/studio.waveform-track';
import { MultiVoiceRenderBar, RenderedTracksSection, VoiceMirrorButton } from '@gitroom/frontend/components/studio/studio.audio-render';

const inputCls = 'px-[10px] py-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';
const tinySel = 'h-[30px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText';
const ghostBtn = 'h-[30px] px-[10px] rounded-[6px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover';
const card = 'rounded-[8px] border border-newBorder bg-newBgColor p-[14px]';

const Spinner: FC = () => (
  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

// Circular-arrow "regenerate" glyph.
const Recycle: FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
  </svg>
);

// Script name — local edit, commit on blur (so spaces + clearing work while typing). An empty/
// whitespace-only entry snaps back to the current name (a script needs a name); the server trims.
const NameField: FC<{ value: string; onCommit: (name: string) => void }> = ({ value, onCommit }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  return (
    <input value={draft} placeholder="Script name" aria-label="Script name"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { const t = draft.trim(); if (t && t !== value) onCommit(t); else setDraft(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className={inputCls + ' flex-1 font-[600]'} />
  );
};

// ── Panel shell — scripts sidebar + selected-script canvas ──────────────────
export const StudioScriptPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const script = state.activeScript;
  const brandKitId = state.composerBrandKitId || 'default';
  const [library, setLibrary] = useState<ScriptDoc[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const publish = useCallback((s: ScriptDoc) => dispatch({ type: 'SET_ACTIVE_SCRIPT', script: s }), [dispatch]);
  const refreshLibrary = useCallback(() => { sc.listScripts(brandKitId).then(setLibrary).catch(() => undefined); }, [brandKitId]);
  // Refresh when the active script changes (draft / select / delete all flip script_id).
  useEffect(() => { refreshLibrary(); }, [refreshLibrary, script?.script_id]);

  const select = useCallback((id: string) => { sc.getScript(id).then(publish).catch((e) => setError((e as Error)?.message ?? String(e))); }, [publish]);

  // Bulk select-and-delete (mirrors the Images tab).
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const exitSelect = () => { setSelectMode(false); setChecked(new Set()); setConfirmBulk(false); };
  const toggleCheck = (sid: string) => setChecked((s) => { const n = new Set(s); if (n.has(sid)) n.delete(sid); else n.add(sid); return n; });
  const doBulkDelete = async () => {
    if (!checked.size) return;
    setBulkBusy(true); setError(null);
    try {
      await sc.deleteScripts([...checked]);
      if (script && checked.has(script.script_id)) dispatch({ type: 'SET_ACTIVE_SCRIPT', script: null });
      exitSelect();
      refreshLibrary();
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBulkBusy(false); }
  };

  return (
    <div className="flex flex-col md:flex-row gap-[14px]">
      {/* Left — the brand's scripts library */}
      <div className={card + ' md:w-[260px] shrink-0 flex flex-col gap-[10px]'}>
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="text-[14px] font-[600] text-btnText flex-1">Scripts</span>
          <span className="text-[11px] text-textItemBlur">{library.length}</span>
          {library.length > 0 && !selectMode && (
            <button type="button" onClick={() => setSelectMode(true)}
              className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur hover:text-btnText">Select</button>
          )}
          {!selectMode && (
            <button type="button" onClick={() => setUploadOpen(true)} title="Upload an audio file to this brand"
              className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur hover:text-btnText">⬆ Upload</button>
          )}
        </div>
        {selectMode && (
          <div className="flex items-center gap-[6px] flex-wrap text-[11px]">
            <span className="text-textItemBlur">{checked.size} selected</span>
            <button type="button" onClick={() => setChecked(new Set(library.map((s) => s.script_id)))} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">All</button>
            <button type="button" onClick={() => setChecked(new Set())} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">None</button>
            <button type="button" onClick={exitSelect} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">Done</button>
            {confirmBulk ? (
              <>
                <button type="button" disabled={!checked.size || bulkBusy} onClick={doBulkDelete} className="px-[8px] h-[24px] rounded-[5px] bg-[#ff7eb6] text-[#3a0d23] font-[700] disabled:opacity-50 inline-flex items-center gap-[4px]">{bulkBusy && <Spinner />}Delete {checked.size}</button>
                <button type="button" onClick={() => setConfirmBulk(false)} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">Cancel</button>
              </>
            ) : (
              <button type="button" disabled={!checked.size} onClick={() => setConfirmBulk(true)} className="px-[8px] h-[24px] rounded-[5px] border border-[#ff7eb6]/40 text-[#ff7eb6] font-[600] disabled:opacity-40 hover:bg-[#ff7eb6]/10">Delete ({checked.size})</button>
            )}
          </div>
        )}
        {library.length === 0 ? (
          <div className="text-[12px] text-textItemBlur py-[10px] leading-[1.5]">No scripts yet. Draft one with the Script Director above.</div>
        ) : (
          <div className="flex flex-col gap-[6px] overflow-y-auto max-h-[62vh] pr-[2px]">
            {library.map((s) => {
              const active = s.script_id === script?.script_id;
              const isChecked = checked.has(s.script_id);
              const ring = selectMode
                ? (isChecked ? 'border-[#ff7eb6] bg-[#ff7eb6]/10' : 'border-newBorder bg-newBgColorInner hover:bg-boxHover')
                : (active ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColorInner hover:bg-boxHover');
              return (
                <button key={s.script_id} type="button" onClick={() => (selectMode ? toggleCheck(s.script_id) : select(s.script_id))}
                  className={'flex items-center gap-[8px] text-left rounded-[8px] border px-[12px] py-[10px] ' + ring}>
                  {selectMode && (
                    <span className={'h-[16px] w-[16px] rounded-[4px] border flex items-center justify-center text-[10px] leading-none shrink-0 ' + (isChecked ? 'bg-[#ff7eb6] border-[#ff7eb6] text-[#3a0d23]' : 'border-newBorder text-transparent')}>✓</span>
                  )}
                  <span className="flex flex-col gap-[2px] min-w-0 flex-1">
                    <span className="text-[13px] font-[600] text-btnText truncate">{s.name}</span>
                    <span className="text-[11px] text-textItemBlur">{s.format} · {s.beats.length} beats · {s.target_duration_s}s</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {error && <span className="text-[12px] text-red-400">{error}</span>}
      </div>

      {/* Right — the selected script's canvas */}
      <div className="flex-1 min-w-0 flex flex-col gap-[14px]">
        {!script ? (
          <div className={card + ' flex-1 flex items-center justify-center text-center text-[13px] text-textItemBlur py-[60px]'}>
            Select a script from the library, or draft one with the Script Director above.
          </div>
        ) : (
          <ScriptCanvas script={script} />
        )}
        {/* Audio already attached to the active ad cascades in here (renders nothing when empty). */}
        <StudioAdAssetShelf objectType="audio" />
      </div>

      {/* Audio upload modal — mirrors the Images/Video tab uploads. */}
      {uploadOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => setUploadOpen(false)}>
          <div className="w-[560px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-[8px]">
              <span className="text-[15px] font-[700] text-btnText flex-1">Upload audio to this brand</span>
              <button type="button" onClick={() => setUploadOpen(false)} className="h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText">✕</button>
            </div>
            <span className="text-[12px] text-textItemBlur">Drag &amp; drop or browse: MP3 / WAV / M4A. Added to this brand&apos;s audio pool.</span>
            <StudioDropZone accept="audio" brandKitId={brandKitId} onUploaded={() => setUploadOpen(false)} />
          </div>
        </div>, document.body)}
    </div>
  );
};

// ── Canvas — the active script's writer's room (only mounted when a script exists) ──────────────
const ScriptCanvas: FC<{ script: ScriptDoc }> = ({ script }) => {
  const { state, dispatch } = useStudio();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bound, setBound] = useState(false); // "→ Ad" confirmation flash.

  // --- VO preview (script-driven, single narrator) ---
  const voiceId = state.audioVoiceId;
  const setVoiceId = (v: string) => dispatch({ type: 'SET_AUDIO_VOICE', voiceId: v });
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [vo, setVo] = useState<{ url: string } | null>(null);
  const [genSig, setGenSig] = useState<string | null>(null);

  const publish = useCallback((s: ScriptDoc) => dispatch({ type: 'SET_ACTIVE_SCRIPT', script: s }), [dispatch]);
  // Run a mutation, publish the returned doc, surface errors without crashing.
  const run = useCallback(async (p: Promise<ScriptDoc>) => {
    setBusy(true); setError(null);
    try { publish(await p); } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBusy(false); }
  }, [publish]);

  const budget = sc.computeBudget(script);
  const id = script.script_id;
  const charName = (cid: string | null) => (cid ? script.cast.find((c) => c.id === cid)?.name ?? '—' : 'Narrator');
  // Narration is the implicit narrator (character_id=null → "Narrator" in the speaker dropdown). Hide
  // any redundant cast member literally named "Narrator" so we never show two "Narrator"s. New scripts
  // no longer create one (scriptgen.mjs); this also cleans up scripts saved before that fix.
  const displayCast = script.cast.filter((c) => c.name.trim().toLowerCase() !== 'narrator');

  // --- mutations ---
  const setName = (name: string) => run(sc.updateScript(id, { name }));
  const setTarget = (n: number) => run(sc.updateScript(id, { targetDurationS: n }));
  const del = () => { if (confirm('Delete this script?')) run(sc.deleteScript(id).then(() => null as any)).then(() => dispatch({ type: 'SET_ACTIVE_SCRIPT', script: null })); };
  const addCharacter = () => run(sc.addCharacter(id, { name: `Character ${script.cast.length + 1}` }));
  const updateCharacter = (cid: string, patch: any) => run(sc.updateCharacter(id, cid, patch));
  const removeCharacter = (cid: string) => run(sc.removeCharacter(id, cid));
  const castVoice = (cid: string, v: string) => run(sc.castVoice(id, cid, v));
  const addBeat = () => run(sc.addBeat(id, { label: 'New beat', target_duration_s: 5 }));
  const updateBeat = (bid: string, patch: any) => run(sc.updateBeat(id, bid, patch));
  const removeBeat = (bid: string) => run(sc.removeBeat(id, bid));
  const moveBeat = (bid: string, dir: -1 | 1) => {
    const order = script.beats.map((b) => b.id);
    const i = order.indexOf(bid); const j = i + dir;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    run(sc.reorderBeats(id, order));
  };
  const addLine = (bid: string) => run(sc.addLine(id, bid, { text: '' }));
  const updateLine = (bid: string, lid: string, patch: any) => run(sc.updateLine(id, bid, lid, patch));
  const removeLine = (bid: string, lid: string) => run(sc.removeLine(id, bid, lid));

  // --- Hooks: edit / select / regenerate all mirror the SELECTED hook into the Hook beat's opening
  // line. The Hook beat = the first beat labelled "hook", else the first beat. ---
  const hookBeat = script.beats.find((b) => /hook/i.test(b.label)) || script.beats[0] || null;
  const hookLineId = hookBeat?.lines[0]?.id ?? null;
  const selectedHookId = script.hooks.find((h) => h.selected)?.id ?? null;
  const [hookDraft, setHookDraft] = useState<Record<string, string>>({});
  const [regenHookId, setRegenHookId] = useState<string | null>(null);
  const [regenBeatId, setRegenBeatId] = useState<string | null>(null);
  // The hook the beats are currently aligned to (baseline). "Realign" activates when the selection
  // drifts from it, and goes dormant again on revert; resets when the active script changes.
  const [alignedHookId, setAlignedHookId] = useState<string | null>(selectedHookId);
  const [realigning, setRealigning] = useState(false);
  useEffect(() => { setAlignedHookId(script.hooks.find((h) => h.selected)?.id ?? null); }, [script.script_id]);
  const realignDirty = !!selectedHookId && !!alignedHookId && selectedHookId !== alignedHookId;

  // Select a hook: mark it selected AND mirror its text into the Hook beat's opening line.
  const selectHook = async (hid: string) => {
    const hook = script.hooks.find((h) => h.id === hid);
    setBusy(true); setError(null);
    try {
      let doc = await sc.selectHook(id, hid);
      if (hook && hookBeat && hookLineId) doc = await sc.updateLine(id, hookBeat.id, hookLineId, { text: hook.text });
      publish(doc);
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBusy(false); }
  };

  const editHook = (h: ScriptDoc['hooks'][number], val: string) => {
    setHookDraft((d) => ({ ...d, [h.id]: val }));
    // Optimistic store update so the Beats section reflects the edit live while typing.
    const nextHooks = script.hooks.map((x) => (x.id === h.id ? { ...x, text: val } : x));
    const nextBeats = (h.selected && hookBeat && hookLineId)
      ? script.beats.map((b) => (b.id === hookBeat.id ? { ...b, lines: b.lines.map((l) => (l.id === hookLineId ? { ...l, text: val } : l)) } : b))
      : script.beats;
    dispatch({ type: 'SET_ACTIVE_SCRIPT', script: { ...script, hooks: nextHooks, beats: nextBeats } });
  };
  const commitHook = async (h: ScriptDoc['hooks'][number]) => {
    const val = hookDraft[h.id];
    const clear = () => setHookDraft((d) => { const n = { ...d }; delete n[h.id]; return n; });
    // A draft only exists after the user typed; persist it. (Can't compare to h.text — the optimistic
    // live-mirror already set h.text to the draft, which would make an equality check skip the save.)
    if (val === undefined) { clear(); return; }
    setBusy(true); setError(null);
    try {
      const hooks = script.hooks.map((x) => ({ id: x.id, pattern: x.pattern, text: x.id === h.id ? val : x.text, selected: x.selected }));
      let doc = await sc.setHooks(id, hooks);
      // Persist the mirrored Hook-beat line too (selected hook only).
      if (h.selected && hookBeat && hookLineId) doc = await sc.updateLine(id, hookBeat.id, hookLineId, { text: val });
      publish(doc);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); clear(); }
  };
  const regenerateHook = async (hid: string) => {
    setRegenHookId(hid); setError(null);
    try {
      let doc = await sc.regenerateHook(id, hid);
      const nh = doc.hooks.find((h) => h.id === hid);
      if (nh?.selected && hookBeat && hookLineId) doc = await sc.updateLine(id, hookBeat.id, hookLineId, { text: nh.text });
      publish(doc);
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setRegenHookId(null); }
  };
  const regenerateBeat = async (bid: string) => {
    setRegenBeatId(bid); setError(null);
    try { publish(await sc.regenerateBeat(id, bid)); } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setRegenBeatId(null); }
  };
  // Realign: rewrite every body beat to pay off the newly selected hook, then adopt it as the baseline.
  const realign = async () => {
    if (!realignDirty || realigning) return;
    setRealigning(true); setError(null);
    try { publish(await sc.realignToHook(id)); setAlignedHookId(selectedHookId); }
    catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setRealigning(false); }
  };
  const setPron = (rows: Array<{ term: string; phonetic: string }>) => run(sc.setPronunciation(id, rows.filter((r) => r.term.trim())));
  const bindToAd = async () => {
    const adId = state.activeAdId;
    if (!adId) { setError('Select an active ad first (Director bar above).'); return; }
    setBusy(true); setError(null);
    try { await addObject({ adId, type: 'script', id }); setBound(true); setTimeout(() => setBound(false), 2500); }
    catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBusy(false); }
  };

  // A signature of what the render depends on — beats/lines text, pronunciation, and voice. If it
  // changes after a render, the clip is stale (the writer edited the script).
  const voSig = (s: ScriptDoc, v: string) => JSON.stringify({ v, b: s.beats.map((b) => b.lines.map((l) => l.text)), p: s.pronunciation });
  const hasLines = script.beats.some((b) => b.lines.some((l) => l.text.trim()));
  const stale = !!vo && genSig !== voSig(script, voiceId);
  const generateVoice = async () => {
    if (!voiceId || !hasLines || genBusy) return;
    setGenBusy(true); setGenErr(null);
    try {
      const r = await generateVOFromScript({ scriptId: id, voiceId });
      setVo({ url: r.url });
      setGenSig(voSig(script, voiceId));
    } catch (e) { setGenErr((e as Error)?.message ?? String(e)); } finally { setGenBusy(false); }
  };
  // When the AI Agent renders a VO for THIS script, show it on the canvas too.
  useEffect(() => {
    const onVo = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.url && d.scriptId === id) { setVo({ url: d.url }); setGenSig(voSig(script, voiceId)); }
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('reinvestorhub:script-vo', onVo);
    return () => window.removeEventListener('reinvestorhub:script-vo', onVo);
  }, [id, script, voiceId]);
  // Reload the last generated VO for this script from disk on mount / script switch, so the clip
  // survives navigating away and back (the file + its script-linked manifest persist on the brain).
  useEffect(() => {
    let live = true;
    latestVOForScript(id).then((r) => {
      if (!live) return;
      if (r?.url) { setVo({ url: r.url }); setGenSig(voSig(script, voiceId)); }
      else { setVo(null); setGenSig(null); }
    }).catch(() => undefined);
    return () => { live = false; };
    // Keyed on the script id only — reloading on every edit would fight the stale indicator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* VO preview — hear the whole script in one voice (per-character casting is Plan 2). */}
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
        <div className="flex items-center gap-[10px] flex-wrap">
          <span className="text-[13px] font-[600] text-btnText">Voice-over preview</span>
          <span className="text-[11px] text-textItemBlur flex-1 hidden lg:inline">Hear your whole script read by one ElevenLabs voice (the sound). The persona — the way of speaking — is the tone you set per character in Cast below. Per-character voices come in Plan 2.</span>
          <label className="flex items-center gap-[6px] text-[11px] font-[600] text-textItemBlur">Voice
            <StudioVoicePicker value={voiceId} onChange={setVoiceId} onError={setGenErr} />
          </label>
          <button type="button" onClick={generateVoice} disabled={genBusy || !voiceId || !hasLines}
            title={!hasLines ? 'Write some lines first' : 'Render this script as a single-voice VO'}
            className="h-[40px] px-[16px] rounded-[8px] bg-ai text-white font-[600] inline-flex items-center justify-center gap-[6px] disabled:opacity-50 disabled:cursor-not-allowed">
            {genBusy && <Spinner />}{genBusy ? 'Generating…' : '⚡ Generate'}
          </button>
          <VoiceMirrorButton script={script} brandKitId={state.composerBrandKitId || 'default'} />
        </div>
        {vo && (
          <div className="flex flex-col gap-[6px]">
            <WaveformTrack url={vo.url} stale={stale} onError={setGenErr} />
            {stale && <span className="text-[11px] text-amber-400">Script or voice changed since this render. Regenerate to hear the latest.</span>}
          </div>
        )}
        {genErr && <div className="text-[12px] text-red-400 leading-[1.4]">{genErr}</div>}
      </div>

      {/* Header: name + budget meter + bind/delete */}
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <NameField value={script.name} onCommit={setName} />
          <button type="button" onClick={bindToAd} disabled={!state.activeAdId}
            className={'h-[34px] px-[12px] rounded-[8px] border text-[12px] font-[600] ' + (bound ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText hover:bg-boxHover') + ' disabled:opacity-40'}
            title={state.activeAdId ? 'Attach this script to the active ad' : 'Select an active ad first'}>
            {bound ? '✓ Bound' : '→ Ad'}
          </button>
          <button type="button" onClick={del} className={ghostBtn} title="Delete script">🗑</button>
        </div>
        <BudgetMeter budget={budget} onTargetChange={setTarget} />
      </div>

      {/* Hooks — pick one (it flows into the Hook beat), edit inline, or ↻ regenerate a single hook. */}
      <Section title="Hooks" hint="Scroll-stoppers — pick one (it mirrors into the Hook beat), edit inline, or ↻ regenerate a single hook in context.">
        {script.hooks.length === 0 ? (
          <Empty>No hooks yet. Ask the AI to “generate 5 hook variants”, or draft with the Director.</Empty>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {script.hooks.map((h) => (
              <div key={h.id} className={'flex items-center gap-[8px] rounded-[8px] border px-[10px] py-[6px] ' + (h.selected ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColorInner')}>
                <input type="radio" name="hook" checked={h.selected} onChange={() => selectHook(h.id)} title="Use this hook" className="shrink-0" />
                <span className="text-[10px] uppercase tracking-wide text-textItemBlur w-[92px] shrink-0">{h.pattern.replace('_', ' ')}</span>
                <input value={hookDraft[h.id] ?? h.text} onChange={(e) => editHook(h, e.target.value)} onBlur={() => commitHook(h)}
                  placeholder="Hook line…" className="flex-1 min-w-0 bg-transparent text-[13px] text-btnText outline-none border-b border-transparent focus:border-newBorder" />
                <button type="button" onClick={() => regenerateHook(h.id)} disabled={regenHookId === h.id}
                  title="Regenerate this hook — keeps its pattern, uses the full script context"
                  className="shrink-0 h-[26px] w-[26px] rounded-[6px] flex items-center justify-center text-textItemBlur hover:text-ai hover:bg-ai/10 disabled:opacity-50">
                  {regenHookId === h.id ? <Spinner /> : <Recycle />}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Cast — name, tone (persona), and the ElevenLabs voice each character renders in (Plan 2). */}
      <Section title="Cast" hint="Who speaks. Name + tone (the persona) + the ElevenLabs voice (the sound) each character is rendered in. Leave the voice on House to use the brand voice." action={<button type="button" onClick={addCharacter} className={ghostBtn}>＋ Character</button>}>
        {displayCast.length === 0 ? <Empty>Single narrator. Add a character for multi-voice dialogue.</Empty> : (
          <div className="flex flex-col gap-[8px]">
            {displayCast.map((c) => (
              <div key={c.id} className="flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[8px] py-[6px] flex-wrap">
                <input value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} className={tinySel + ' w-[110px]'} />
                <select value={c.default_tone} onChange={(e) => updateCharacter(c.id, { default_tone: e.target.value as ScriptTone })} className={tinySel} title="Tone (persona)">
                  {SCRIPT_TONES.map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
                </select>
                <StudioVoicePicker value={c.voice_id ?? ''} onChange={(v) => castVoice(c.id, v)} onError={setError}
                  allowEmpty emptyLabel="🏠 House voice" className={tinySel + ' min-w-[160px]'} />
                <button type="button" onClick={() => removeCharacter(c.id)} className="text-textItemBlur hover:text-btnText px-[4px]" title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Multi-voice render (Plan 2) — cast → render → the stitched track lands in Rendered tracks below. */}
      <MultiVoiceRenderBar script={script} brandKitId={state.composerBrandKitId || 'default'} />
      <RenderedTracksSection script={script} brandKitId={state.composerBrandKitId || 'default'} activeAdId={state.activeAdId} />

      {/* Beats */}
      <Section title="Beats" hint="Each beat is time-budgeted; write lines to the seconds you have." action={
        <span className="flex items-center gap-[8px]">
          <button type="button" onClick={addBeat} className={ghostBtn}>＋ Beat</button>
          <button type="button" onClick={realign} disabled={!realignDirty || realigning}
            title={realignDirty ? 'Rewrite every beat below to pay off the newly selected hook' : 'Pick a different hook above to enable'}
            className={'h-[30px] px-[12px] rounded-[6px] text-[12px] font-[600] inline-flex items-center gap-[6px] transition-colors ' + (realignDirty ? 'bg-ai text-white hover:opacity-90' : 'border border-newBorder text-textItemBlur opacity-50 cursor-not-allowed')}>
            {realigning ? <Spinner /> : <Recycle />} Realign
          </button>
        </span>
      }>
        {script.beats.length === 0 ? <Empty>No beats yet. Pick a structure in the Director, or add one.</Empty> : (
          <div className="flex flex-col gap-[10px]">
            {script.beats.map((b, i) => (
              <BeatCard
                key={b.id} beat={b} index={i} count={script.beats.length}
                budget={budget.beats.find((x) => x.id === b.id)}
                cast={displayCast} charName={charName}
                onLabel={(label) => updateBeat(b.id, { label })}
                onDur={(d) => updateBeat(b.id, { target_duration_s: d })}
                onMove={(dir) => moveBeat(b.id, dir)}
                onRemove={() => removeBeat(b.id)}
                onAddLine={() => addLine(b.id)}
                onLine={(lid, patch) => updateLine(b.id, lid, patch)}
                onRemoveLine={(lid) => removeLine(b.id, lid)}
                onRegen={() => regenerateBeat(b.id)}
                regenerating={regenBeatId === b.id}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Pronunciation */}
      <PronunciationEditor rows={script.pronunciation} onChange={setPron} />

      {busy && <span className="text-[11px] text-textItemBlur">Saving…</span>}
      {error && <div className="text-[12px] text-red-400 leading-[1.4]">{error}</div>}
    </div>
  );
};

// --- sub-components --------------------------------------------------------

const Section: FC<{ title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, action, children }) => (
  <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
    <div className="flex items-center gap-[8px]">
      <span className="text-[13px] font-[600] text-btnText">{title}</span>
      {hint && <span className="text-[11px] text-textItemBlur flex-1 hidden lg:inline">{hint}</span>}
      <span className="ml-auto">{action}</span>
    </div>
    {children}
  </div>
);
const Empty: FC<{ children: React.ReactNode }> = ({ children }) => <span className="text-[12px] text-textItemBlur">{children}</span>;

const BudgetMeter: FC<{ budget: sc.ScriptBudget; onTargetChange: (n: number) => void }> = ({ budget, onTargetChange }) => {
  const pct = budget.targetDurationS > 0 ? Math.min(150, Math.round((budget.totalSeconds / budget.targetDurationS) * 100)) : 0;
  return (
    <div className="flex items-center gap-[10px]">
      <div className="flex-1 h-[8px] rounded-full bg-newBgColorInner overflow-hidden">
        <div className={'h-full ' + (budget.overBudget ? 'bg-red-500' : 'bg-ai')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={'text-[12px] tabular-nums ' + (budget.overBudget ? 'text-red-400' : 'text-textItemBlur')}>
        ~{budget.totalSeconds}s / {budget.targetDurationS}s · {budget.totalWords} words
      </span>
      <input type="number" min={5} max={600} value={budget.targetDurationS} onChange={(e) => onTargetChange(Math.max(5, Number(e.target.value) || 30))}
        className="h-[30px] w-[64px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText" title="Target length (s)" />
    </div>
  );
};

const BeatCard: FC<{
  beat: ScriptBeat; index: number; count: number;
  budget?: { words: number; seconds: number; targetDurationS: number; overBudget: boolean };
  cast: ScriptDoc['cast']; charName: (cid: string | null) => string;
  onLabel: (s: string) => void; onDur: (n: number) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void;
  onAddLine: () => void; onLine: (lid: string, patch: any) => void; onRemoveLine: (lid: string) => void;
  onRegen?: () => void; regenerating?: boolean;
}> = ({ beat, index, count, budget, cast, onLabel, onDur, onMove, onRemove, onAddLine, onLine, onRemoveLine, onRegen, regenerating }) => (
  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] flex flex-col gap-[8px]">
    <div className="flex items-center gap-[8px]">
      <span className="text-[11px] text-textItemBlur w-[18px] text-center">{index + 1}</span>
      <input value={beat.label} onChange={(e) => onLabel(e.target.value)} className="h-[30px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[12px] font-[600] text-btnText flex-1" />
      <input type="number" min={0} value={beat.target_duration_s} onChange={(e) => onDur(Math.max(0, Number(e.target.value) || 0))}
        className="h-[30px] w-[58px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[12px] text-btnText" title="Beat target (s)" />
      {budget && <span className={'text-[11px] tabular-nums ' + (budget.overBudget ? 'text-red-400' : 'text-textItemBlur')}>~{budget.seconds}s</span>}
      {onRegen && (
        <button type="button" onClick={onRegen} disabled={regenerating}
          title="Regenerate this beat's lines — on-budget, full context" aria-label="Regenerate beat"
          className="text-textItemBlur hover:text-ai disabled:opacity-50 px-[2px] flex items-center">
          {regenerating ? <Spinner /> : <Recycle />}
        </button>
      )}
      <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="text-textItemBlur hover:text-btnText disabled:opacity-30 px-[2px]" title="Up">↑</button>
      <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="text-textItemBlur hover:text-btnText disabled:opacity-30 px-[2px]" title="Down">↓</button>
      <button type="button" onClick={onRemove} className="text-textItemBlur hover:text-btnText px-[2px]" title="Remove beat">✕</button>
    </div>
    <div className="flex flex-col gap-[6px] pl-[18px]">
      {beat.lines.map((l) => (
        <LineRow key={l.id} line={l} cast={cast} onChange={(patch) => onLine(l.id, patch)} onRemove={() => onRemoveLine(l.id)} />
      ))}
      <button type="button" onClick={onAddLine} className="self-start text-[12px] text-textItemBlur hover:text-btnText">＋ line</button>
    </div>
  </div>
);

const LineRow: FC<{ line: ScriptLine; cast: ScriptDoc['cast']; onChange: (patch: any) => void; onRemove: () => void }> = ({ line, cast, onChange, onRemove }) => {
  // Debounce text into local state so typing stays smooth; commit on blur.
  const [text, setText] = useState(line.text);
  useEffect(() => { setText(line.text); }, [line.text]);
  return (
    <div className="flex items-start gap-[6px]">
      <select value={cast.some((c) => c.id === line.character_id) ? (line.character_id ?? '') : ''} onChange={(e) => onChange({ characterId: e.target.value || null })} className={tinySel + ' w-[100px] mt-[1px]'} title="Speaker">
        <option value="">Narrator</option>
        {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== line.text && onChange({ text })}
        rows={1} placeholder="Line…" className={inputCls + ' flex-1 resize-y min-h-[34px]'} />
      <select value={line.tone} onChange={(e) => onChange({ tone: e.target.value })} className={tinySel + ' w-[120px] mt-[1px]'} title="Tone (blank = character default)">
        <option value="">(tone)</option>
        {SCRIPT_TONES.map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
      </select>
      <input value={line.direction} onChange={(e) => onChange({ direction: e.target.value })} placeholder="direction" className={tinySel + ' w-[120px] mt-[1px]'} title="Delivery direction" />
      <button type="button" onClick={onRemove} className="text-textItemBlur hover:text-btnText px-[2px] mt-[6px]" title="Remove line">✕</button>
    </div>
  );
};

const PronunciationEditor: FC<{ rows: Array<{ term: string; phonetic: string }>; onChange: (rows: Array<{ term: string; phonetic: string }>) => void }> = ({ rows, onChange }) => {
  const [local, setLocal] = useState(rows);
  useEffect(() => { setLocal(rows); }, [rows]);
  const commit = (next: Array<{ term: string; phonetic: string }>) => { setLocal(next); };
  return (
    <Section title="Pronunciation" hint="Force how TTS says jargon (ARV, DSCR, BRRRR, cap rate)." action={<button type="button" onClick={() => commit([...local, { term: '', phonetic: '' }])} className={ghostBtn}>＋ Term</button>}>
      {local.length === 0 ? <Empty>No overrides.</Empty> : (
        <div className="flex flex-col gap-[6px]">
          {local.map((r, i) => (
            <div key={i} className="flex items-center gap-[6px]">
              <input value={r.term} placeholder="Term (DSCR)" onChange={(e) => { const n = local.slice(); n[i] = { ...n[i], term: e.target.value }; setLocal(n); }} onBlur={() => onChange(local)} className={tinySel + ' w-[160px]'} />
              <span className="text-textItemBlur">→</span>
              <input value={r.phonetic} placeholder="Say it (D-S-C-R)" onChange={(e) => { const n = local.slice(); n[i] = { ...n[i], phonetic: e.target.value }; setLocal(n); }} onBlur={() => onChange(local)} className={tinySel + ' flex-1'} />
              <button type="button" onClick={() => { const n = local.filter((_, j) => j !== i); setLocal(n); onChange(n); }} className="text-textItemBlur hover:text-btnText px-[2px]">✕</button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};
