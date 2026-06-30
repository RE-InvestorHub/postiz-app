'use client';

// Script panel — the ✍ Script sub-view of the Audio tab: the writer's-room canvas (Plan 1).
// Reads/writes the active structured Script (services/brain/lib/scripts.mjs) via the script-client.
// Cast + time-budgeted beats + per-line dialogue/direction + hook variants + pronunciation, with a
// live words/seconds budget meter. Every edit returns the full ScriptDoc → SET_ACTIVE_SCRIPT (the
// agent + the panel share this lever). Postiz tokens only.

import { FC, useCallback, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { ScriptDoc, ScriptBeat, ScriptLine, SCRIPT_TONES, ScriptTone } from '@gitroom/frontend/components/studio/studio.types';
import * as sc from '@gitroom/frontend/components/studio/studio.script-client';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';

const inputCls = 'px-[10px] py-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';
const tinySel = 'h-[30px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText';
const ghostBtn = 'h-[30px] px-[10px] rounded-[6px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText hover:bg-boxHover';

export const StudioScriptPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const script = state.activeScript;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [library, setLibrary] = useState<ScriptDoc[]>([]);
  const [bound, setBound] = useState(false); // "→ Ad" confirmation flash. Declared before any early return (rules-of-hooks).

  const brandKitId = state.composerBrandKitId || 'default';
  const publish = useCallback((s: ScriptDoc) => dispatch({ type: 'SET_ACTIVE_SCRIPT', script: s }), [dispatch]);
  // Run a mutation, publish the returned doc, surface errors without crashing.
  const run = useCallback(async (p: Promise<ScriptDoc>) => {
    setBusy(true); setError(null);
    try { publish(await p); } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBusy(false); }
  }, [publish]);

  const refreshLibrary = useCallback(() => { sc.listScripts(brandKitId).then(setLibrary).catch(() => undefined); }, [brandKitId]);
  useEffect(() => { refreshLibrary(); }, [refreshLibrary, script?.script_id]);

  if (!script) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <span className="text-[13px] text-textItemBlur">No active script. Draft one with the Audio Director above, or open a saved script:</span>
        {library.length === 0 ? (
          <span className="text-[12px] text-textItemBlur">No saved scripts for this brand yet.</span>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {library.map((s) => (
              <button key={s.script_id} type="button" onClick={() => sc.getScript(s.script_id).then(publish)}
                className="flex items-center gap-[8px] text-left rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] py-[10px] hover:bg-boxHover">
                <span className="text-[13px] font-[600] text-btnText flex-1 truncate">{s.name}</span>
                <span className="text-[11px] text-textItemBlur">{s.format} · {s.beats.length} beats · {s.target_duration_s}s</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const budget = sc.computeBudget(script);
  const id = script.script_id;
  const charName = (cid: string | null) => (cid ? script.cast.find((c) => c.id === cid)?.name ?? '—' : 'Narrator');

  // --- mutations ---
  const setName = (name: string) => run(sc.updateScript(id, { name }));
  const setTarget = (n: number) => run(sc.updateScript(id, { targetDurationS: n }));
  const del = () => { if (confirm('Delete this script?')) run(sc.deleteScript(id).then(() => null as any)).then(() => dispatch({ type: 'SET_ACTIVE_SCRIPT', script: null })); };
  const addCharacter = () => run(sc.addCharacter(id, { name: `Character ${script.cast.length + 1}` }));
  const updateCharacter = (cid: string, patch: any) => run(sc.updateCharacter(id, cid, patch));
  const removeCharacter = (cid: string) => run(sc.removeCharacter(id, cid));
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
  const selectHook = (hid: string) => run(sc.selectHook(id, hid));
  const setPron = (rows: Array<{ term: string; phonetic: string }>) => run(sc.setPronunciation(id, rows.filter((r) => r.term.trim())));
  const bindToAd = async () => {
    const adId = state.activeAdId;
    if (!adId) { setError('Select an active ad first (Director bar above).'); return; }
    setBusy(true); setError(null);
    try { await addObject({ adId, type: 'script', id }); setBound(true); setTimeout(() => setBound(false), 2500); }
    catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBusy(false); }
  };

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Header: name + budget meter + bind/delete */}
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[14px] flex flex-col gap-[10px]">
        <div className="flex items-center gap-[10px]">
          <input value={script.name} onChange={(e) => setName(e.target.value)} className={inputCls + ' flex-1 font-[600]'} />
          <button type="button" onClick={bindToAd} disabled={!state.activeAdId}
            className={'h-[34px] px-[12px] rounded-[8px] border text-[12px] font-[600] ' + (bound ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText hover:bg-boxHover') + ' disabled:opacity-40'}
            title={state.activeAdId ? 'Attach this script to the active ad' : 'Select an active ad first'}>
            {bound ? '✓ Bound' : '→ Ad'}
          </button>
          <button type="button" onClick={del} className={ghostBtn} title="Delete script">🗑</button>
        </div>
        <BudgetMeter budget={budget} onTargetChange={setTarget} />
      </div>

      {/* Hooks */}
      <Section title="Hooks" hint="Scroll-stoppers — the agent generates variants by pattern; pick the winner.">
        {script.hooks.length === 0 ? (
          <Empty>No hooks yet. Ask the AI to “generate 5 hook variants”, or draft with the Director.</Empty>
        ) : (
          <div className="flex flex-col gap-[6px]">
            {script.hooks.map((h) => (
              <label key={h.id} className={'flex items-center gap-[8px] rounded-[8px] border px-[10px] py-[8px] cursor-pointer ' + (h.selected ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColorInner')}>
                <input type="radio" name="hook" checked={h.selected} onChange={() => selectHook(h.id)} />
                <span className="text-[10px] uppercase tracking-wide text-textItemBlur w-[110px]">{h.pattern.replace('_', ' ')}</span>
                <span className="text-[13px] text-btnText flex-1">{h.text}</span>
              </label>
            ))}
          </div>
        )}
      </Section>

      {/* Cast */}
      <Section title="Cast" hint="Who speaks. Voice casting comes in the next phase — here you define the characters." action={<button type="button" onClick={addCharacter} className={ghostBtn}>＋ Character</button>}>
        {script.cast.length === 0 ? <Empty>Single narrator. Add a character for multi-voice dialogue.</Empty> : (
          <div className="flex flex-wrap gap-[8px]">
            {script.cast.map((c) => (
              <div key={c.id} className="flex items-center gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[8px] py-[6px]">
                <input value={c.name} onChange={(e) => updateCharacter(c.id, { name: e.target.value })} className={tinySel + ' w-[110px]'} />
                <select value={c.default_tone} onChange={(e) => updateCharacter(c.id, { default_tone: e.target.value as ScriptTone })} className={tinySel}>
                  {SCRIPT_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button type="button" onClick={() => removeCharacter(c.id)} className="text-textItemBlur hover:text-btnText px-[4px]" title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Beats */}
      <Section title="Beats" hint="Each beat is time-budgeted; write lines to the seconds you have." action={<button type="button" onClick={addBeat} className={ghostBtn}>＋ Beat</button>}>
        {script.beats.length === 0 ? <Empty>No beats yet. Pick a structure in the Director, or add one.</Empty> : (
          <div className="flex flex-col gap-[10px]">
            {script.beats.map((b, i) => (
              <BeatCard
                key={b.id} beat={b} index={i} count={script.beats.length}
                budget={budget.beats.find((x) => x.id === b.id)}
                cast={script.cast} charName={charName}
                onLabel={(label) => updateBeat(b.id, { label })}
                onDur={(d) => updateBeat(b.id, { target_duration_s: d })}
                onMove={(dir) => moveBeat(b.id, dir)}
                onRemove={() => removeBeat(b.id)}
                onAddLine={() => addLine(b.id)}
                onLine={(lid, patch) => updateLine(b.id, lid, patch)}
                onRemoveLine={(lid) => removeLine(b.id, lid)}
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
}> = ({ beat, index, count, budget, cast, onLabel, onDur, onMove, onRemove, onAddLine, onLine, onRemoveLine }) => (
  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] flex flex-col gap-[8px]">
    <div className="flex items-center gap-[8px]">
      <span className="text-[11px] text-textItemBlur w-[18px] text-center">{index + 1}</span>
      <input value={beat.label} onChange={(e) => onLabel(e.target.value)} className="h-[30px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[12px] font-[600] text-btnText flex-1" />
      <input type="number" min={0} value={beat.target_duration_s} onChange={(e) => onDur(Math.max(0, Number(e.target.value) || 0))}
        className="h-[30px] w-[58px] px-[8px] rounded-[6px] bg-newBgColor border border-newBorder text-[12px] text-btnText" title="Beat target (s)" />
      {budget && <span className={'text-[11px] tabular-nums ' + (budget.overBudget ? 'text-red-400' : 'text-textItemBlur')}>~{budget.seconds}s</span>}
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
      <select value={line.character_id ?? ''} onChange={(e) => onChange({ characterId: e.target.value || null })} className={tinySel + ' w-[100px] mt-[1px]'} title="Speaker">
        <option value="">Narrator</option>
        {cast.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => text !== line.text && onChange({ text })}
        rows={1} placeholder="Line…" className={inputCls + ' flex-1 resize-y min-h-[34px]'} />
      <select value={line.tone} onChange={(e) => onChange({ tone: e.target.value })} className={tinySel + ' w-[120px] mt-[1px]'} title="Tone (blank = character default)">
        <option value="">(tone)</option>
        {SCRIPT_TONES.map((t) => <option key={t} value={t}>{t}</option>)}
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
