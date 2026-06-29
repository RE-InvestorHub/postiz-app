'use client';

// Scene Director — build an ad shot object-by-object via preset dropdowns, then hand the
// selection to the AI agent to develop into a full spec and render (the ONLY path to a
// render — no direct generate). Lives on the Image tab; renders land in the brand library.
// Each component-backed dimension also offers the brand's SAVED reusable components
// (characters / scenes / lighting / …). Postiz tokens only.

import { FC, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { STUDIO_RESOLUTIONS } from '@gitroom/frontend/components/studio/studio.types';
import { listDirectorDimensions, DirectorDimension, listDirectorTemplates, saveDirectorTemplate, DirectorTemplate } from '@gitroom/frontend/components/studio/studio.director-client';
import { SoulControl } from '@gitroom/frontend/components/studio/studio.soul-control';

// Aspect ratios Higgsfield's Soul model (text2image_soul_v2) accepts — when a saved character is
// selected the render may run on the Soul, so we restrict to these (4:5 is the notable exclusion).
const SOUL_ASPECTS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'];
const ASPECT_LABELS: Record<string, string> = {
  '4:5': 'Feed 4:5', '1:1': 'Square 1:1', '9:16': 'Story/Reels 9:16', '16:9': 'Wide 16:9',
  '3:4': 'Portrait 3:4', '4:3': 'Landscape 4:3', '2:3': 'Tall 2:3', '3:2': 'Wide 3:2',
};
const BASE_ASPECT_IDS = ['4:5', '1:1', '9:16', '16:9'];
// With a character selected, also offer the Soul portrait/landscape ratios.
const CHAR_ASPECT_IDS = ['4:5', '1:1', '9:16', '16:9', '3:4', '4:3', '2:3', '3:2'];

export const StudioSceneDirector: FC<{ brandKitId: string }> = ({ brandKitId }) => {
  const { state, dispatch } = useStudio();
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<DirectorDimension[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({}); // dimId -> 'auto' | 'p:<id>' | 'c:<id>'
  const [locked, setLocked] = useState<Record<string, boolean>>({}); // dimId -> locked (agent must not change)
  const [renderMode, setRenderMode] = useState<'layered' | 'single'>('layered');
  const [templates, setTemplates] = useState<DirectorTemplate[]>([]);
  // Aspect + resolution are STORE-backed (the single home for both — moved out of the bottom bar).
  const aspect = state.aspectRatio;
  const setAspect = (a: string) => dispatch({ type: 'SET_ASPECT_RATIO', aspectRatio: a });

  const loadTemplates = () => listDirectorTemplates(brandKitId).then(setTemplates).catch(() => {});
  useEffect(() => { if (open) loadTemplates(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, brandKitId]);

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setSel(t.selection || {}); setLocked({});
    setRenderMode(t.renderMode === 'single' ? 'single' : 'layered'); setAspect(t.aspect || '4:5');
  };
  const onSaveTemplate = async () => {
    const name = typeof window !== 'undefined' ? window.prompt('Name this shot template:') : '';
    if (!name?.trim()) return;
    try { await saveDirectorTemplate({ name: name.trim(), selection: sel, renderMode, aspect, brandKitId }); await loadTemplates(); }
    catch { /* surfaced via no-op */ }
  };

  const reload = () => { if (open) listDirectorDimensions(brandKitId).then(setDims).catch(() => {}); };
  useEffect(reload, [open, brandKitId]);
  // A new component captured elsewhere (the canvas "Save as component") → refresh the dropdowns.
  useEffect(() => {
    const onRefresh = () => listDirectorDimensions(brandKitId).then(setDims).catch(() => {});
    if (typeof window !== 'undefined') window.addEventListener('reinvestorhub:director-refresh', onRefresh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('reinvestorhub:director-refresh', onRefresh); };
  }, [brandKitId]);

  const chosenCount = Object.values(sel).filter((v) => v && v !== 'auto').length;

  // When a saved CHARACTER is selected the render may run on the Higgsfield Soul, which only accepts
  // SOUL_ASPECTS — so we dim the rest (4:5) and snap the current pick to a supported ratio.
  const charDim = dims.find((d) => d.component === 'character');
  const charSelected = !!(charDim && sel[charDim.id]?.startsWith('c:'));
  const aspectIds = charSelected ? CHAR_ASPECT_IDS : BASE_ASPECT_IDS;
  useEffect(() => {
    if (charSelected && !SOUL_ASPECTS.includes(aspect)) setAspect('3:4');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charSelected]);

  const onDevelop = () => {
    const lines: string[] = [];
    for (const d of dims) {
      const v = sel[d.id];
      if (!v || v === 'auto') continue;
      const lk = locked[d.id] ? ' [LOCKED — keep exactly, do not change]' : '';
      if (v.startsWith('p:')) {
        const p = d.presets.find((x) => x.id === v.slice(2));
        if (p) lines.push(`- ${d.label}: ${p.label} (${p.fragment})${lk}`);
      } else if (v.startsWith('c:')) {
        const c = d.components.find((x) => x.id === v.slice(2));
        if (c) lines.push((d.component === 'character'
          ? `- ${d.label}: reuse saved character "${c.name}" (anchorId: ${c.id})`
          : `- ${d.label}: reuse saved "${c.name}"`) + lk);
      }
    }
    const seed =
      `I'm directing an ad shot. Here are my picks — develop the rest, anything not listed is your call:\n` +
      `${lines.length ? lines.join('\n') : '- (all on Auto — propose a strong concept)'}\n` +
      `Render mode: ${renderMode}. Aspect ratio: ${aspect}. Resolution: ${state.resolution}. When you're confident, the Create button will render it.`;
    dispatch({ type: 'OPEN_FLOATING_AGENT', kind: 'shot', brandKitId, seed });
  };

  const selectCls = 'h-[34px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText w-full';

  return (
    <div className="rounded-[8px] border border-ai/40 bg-ai/5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-[8px] px-[14px] py-[10px] text-left">
        <span className="text-[13px] font-[700] text-ai">✨ Scene Director</span>
        <span className="text-[11px] text-textItemBlur flex-1">Build an ad shot object-by-object, then develop + render with AI.{chosenCount ? ` ${chosenCount} set.` : ''}</span>
        <span className="text-[12px] text-textItemBlur">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-[14px] pb-[14px] flex flex-col gap-[12px]">
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-[10px]">
            {dims.flatMap((d) => {
              const lockBtn = (active: boolean) => active && (
                <button type="button" onClick={(e) => { e.preventDefault(); setLocked((l) => ({ ...l, [d.id]: !l[d.id] })); }}
                  title={locked[d.id] ? 'Locked — the agent keeps this exactly' : 'Lock this choice (agent won\'t change it)'}
                  className={'text-[11px] leading-none ' + (locked[d.id] ? 'opacity-100' : 'opacity-40 hover:opacity-80')}>📌</button>
              );
              // The Subject/Character dimension splits into TWO dropdowns: a Subject (presets) and a
              // separate Character (the user's SAVED characters) — the latter only when any exist.
              // Both write the same sel[d.id] (mutually exclusive: a saved character IS the subject).
              if (d.component === 'character') {
                const isChar = sel[d.id]?.startsWith('c:');
                const cells = [
                  <label key={`${d.id}-subject`} className="flex flex-col gap-[3px]">
                    <span className="flex items-center gap-[4px]">
                      <span className="text-[11px] font-[600] text-btnText flex-1" title="Who/what the hero is — a subject type, or pick a saved character →">Subject</span>
                      {!isChar && lockBtn(!!sel[d.id] && sel[d.id] !== 'auto')}
                    </span>
                    <select className={selectCls} value={isChar ? 'auto' : (sel[d.id] || 'auto')}
                      onChange={(e) => setSel((s) => ({ ...s, [d.id]: e.target.value }))}>
                      <option value="auto">{isChar ? 'Using saved character →' : 'Auto — let AI decide'}</option>
                      {d.presets.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.label}</option>)}
                    </select>
                  </label>,
                ];
                if (d.components.length > 0) {
                  cells.push(
                    <label key={`${d.id}-character`} className="flex flex-col gap-[3px]">
                      <span className="flex items-center gap-[4px]">
                        <span className="text-[11px] font-[600] text-btnText flex-1" title="Reuse one of your saved characters (locks identity; train a Soul for an exact match)">Character</span>
                        {isChar && (
                          <SoulControl anchorId={sel[d.id].slice(2)} name={d.components.find((c) => c.id === sel[d.id].slice(2))?.name} />
                        )}
                        {isChar && lockBtn(true)}
                      </span>
                      <select className={selectCls} value={isChar ? sel[d.id] : ''}
                        onChange={(e) => setSel((s) => ({ ...s, [d.id]: e.target.value || 'auto' }))}>
                        <option value="">— No saved character —</option>
                        {d.components.map((c) => <option key={c.id} value={`c:${c.id}`}>★ {c.name}</option>)}
                      </select>
                    </label>
                  );
                }
                return cells;
              }
              // Every other dimension: one dropdown (presets + any saved reusable components).
              return [
                <label key={d.id} className="flex flex-col gap-[3px]">
                  <span className="flex items-center gap-[4px]">
                    <span className="text-[11px] font-[600] text-btnText flex-1" title={d.hint}>{d.label}</span>
                    {lockBtn(!!sel[d.id] && sel[d.id] !== 'auto')}
                  </span>
                  <select className={selectCls} value={sel[d.id] || 'auto'} onChange={(e) => setSel((s) => ({ ...s, [d.id]: e.target.value }))}>
                    <option value="auto">Auto — let AI decide</option>
                    {d.presets.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.label}</option>)}
                    {d.components.length > 0 && (
                      <optgroup label="Saved (reusable)">
                        {d.components.map((c) => <option key={c.id} value={`c:${c.id}`}>★ {c.name}</option>)}
                      </optgroup>
                    )}
                  </select>
                </label>,
              ];
            })}
          </div>

          <div className="flex flex-wrap items-center gap-[10px]">
            <span className="text-[11px] font-[600] text-textItemBlur">Render</span>
            <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden">
              {(['layered', 'single'] as const).map((m) => (
                <button key={m} type="button" onClick={() => setRenderMode(m)}
                  title={m === 'layered' ? 'Object-by-object composite + AI harmonize (default)' : 'One coherent render'}
                  className={'h-[32px] px-[12px] text-[12px] font-[600] capitalize ' + (renderMode === m ? 'bg-btnPrimary text-btnText' : 'text-textItemBlur hover:text-btnText')}>{m}</button>
              ))}
            </span>
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="h-[32px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText"
              title={charSelected ? 'Aspect ratio — limited to what the character Soul supports' : 'Aspect ratio'}>
              {aspectIds.map((id) => {
                const blocked = charSelected && !SOUL_ASPECTS.includes(id);
                return <option key={id} value={id} disabled={blocked}>{ASPECT_LABELS[id]}{blocked ? ' — not on Soul' : ''}</option>;
              })}
            </select>
            <select value={state.resolution} onChange={(e) => dispatch({ type: 'SET_RESOLUTION', resolution: e.target.value as typeof state.resolution })}
              className="h-[32px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText" title="Resolution">
              {STUDIO_RESOLUTIONS.map((r) => <option key={r} value={r}>{r.toUpperCase()}</option>)}
            </select>
            {/* Templates — load a saved selection set, or save the current one. */}
            {templates.length > 0 && (
              <select defaultValue="" onChange={(e) => { applyTemplate(e.target.value); e.target.value = ''; }}
                title="Load a saved template" className="h-[32px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText">
                <option value="">Templates…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button type="button" onClick={onSaveTemplate} title="Save the current picks as a reusable template"
              className="h-[32px] px-[10px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText">Save template</button>
            <button type="button" onClick={onDevelop} className="ml-auto h-[36px] px-[16px] rounded-[8px] bg-ai text-white text-[13px] font-[700] hover:opacity-90">
              ✨ Develop with AI
            </button>
          </div>
          <span className="text-[10px] text-textItemBlur">The agent asks a few questions, then the Create button renders it (uses image credits). Your picks seed the conversation; anything on Auto, it proposes.</span>
        </div>
      )}
    </div>
  );
};
