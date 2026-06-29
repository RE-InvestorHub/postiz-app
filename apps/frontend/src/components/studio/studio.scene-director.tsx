'use client';

// Scene Director — build an ad shot object-by-object via preset dropdowns, then hand the
// selection to the AI agent to develop into a full spec and render (the ONLY path to a
// render — no direct generate). Lives on the Image tab; renders land in the brand library.
// Each component-backed dimension also offers the brand's SAVED reusable components
// (characters / scenes / lighting / …). Postiz tokens only.

import { FC, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { listDirectorDimensions, DirectorDimension } from '@gitroom/frontend/components/studio/studio.director-client';

const ASPECTS = [
  { id: '4:5', label: 'Feed 4:5' }, { id: '1:1', label: 'Square 1:1' },
  { id: '9:16', label: 'Story/Reels 9:16' }, { id: '16:9', label: 'Wide 16:9' },
];

export const StudioSceneDirector: FC<{ brandKitId: string }> = ({ brandKitId }) => {
  const { dispatch } = useStudio();
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<DirectorDimension[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({}); // dimId -> 'auto' | 'p:<id>' | 'c:<id>'
  const [locked, setLocked] = useState<Record<string, boolean>>({}); // dimId -> locked (agent must not change)
  const [renderMode, setRenderMode] = useState<'layered' | 'single'>('layered');
  const [aspect, setAspect] = useState('4:5');

  const reload = () => { if (open) listDirectorDimensions(brandKitId).then(setDims).catch(() => {}); };
  useEffect(reload, [open, brandKitId]);
  // A new component captured elsewhere (the canvas "Save as component") → refresh the dropdowns.
  useEffect(() => {
    const onRefresh = () => listDirectorDimensions(brandKitId).then(setDims).catch(() => {});
    if (typeof window !== 'undefined') window.addEventListener('reinvestorhub:director-refresh', onRefresh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('reinvestorhub:director-refresh', onRefresh); };
  }, [brandKitId]);

  const chosenCount = Object.values(sel).filter((v) => v && v !== 'auto').length;

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
      `Render mode: ${renderMode}. Aspect ratio: ${aspect}. When you're confident, the Create button will render it.`;
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
          <div className="grid grid-cols-2 minCustom:grid-cols-3 gap-[10px]">
            {dims.map((d) => (
              <label key={d.id} className="flex flex-col gap-[3px]">
                <span className="flex items-center gap-[4px]">
                  <span className="text-[11px] font-[600] text-btnText flex-1" title={d.hint}>{d.label}</span>
                  {sel[d.id] && sel[d.id] !== 'auto' && (
                    <button type="button" onClick={(e) => { e.preventDefault(); setLocked((l) => ({ ...l, [d.id]: !l[d.id] })); }}
                      title={locked[d.id] ? 'Locked — the agent keeps this exactly' : 'Lock this choice (agent won\'t change it)'}
                      className={'text-[11px] leading-none ' + (locked[d.id] ? 'opacity-100' : 'opacity-40 hover:opacity-80')}>📌</button>
                  )}
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
              </label>
            ))}
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
            <select value={aspect} onChange={(e) => setAspect(e.target.value)} className="h-[32px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText" title="Aspect ratio">
              {ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
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
