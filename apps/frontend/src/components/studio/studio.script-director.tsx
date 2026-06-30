'use client';

// Script Director — the script-narrowed sibling of the Scene Director (Plan 1). It is the
// "what are we making" layer for the writer's room: format, structure, tone/persona, target
// length, and a free-text brief, plus ✨ Draft (an AI script interview — the 'audioscript'
// generation kind) and ＋ Blank (a hand-authored script). Detailed editing lives in the Script
// sub-view below.
//
// Postiz tokens only; magenta bg-ai for the AI action. Authors nothing that spends.

import { FC, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { SCRIPT_FORMATS, SCRIPT_TONES, TONE_LABELS, ScriptFormat, ScriptStructure, ScriptTone, ScriptFrameworks } from '@gitroom/frontend/components/studio/studio.types';
import { createScript, applyStructure, getFrameworks } from '@gitroom/frontend/components/studio/studio.script-client';

const IconWave: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />
  </svg>
);

const FORMAT_LABELS: Record<ScriptFormat, string> = {
  reel: 'Instagram Reel', tiktok_ad: 'TikTok ad', short_film: 'Short film', explainer: 'Explainer', testimonial: 'Testimonial',
};

export const StudioScriptDirector: FC<{ brandKitId: string }> = ({ brandKitId }) => {
  const { state, dispatch } = useStudio();
  const active = state.activeScript;
  const [open, setOpen] = useState(false); // collapsible card (collapsed by default), matching the Scene Director
  const [format, setFormat] = useState<ScriptFormat>('reel');
  const [structure, setStructure] = useState<ScriptStructure | ''>('hook_retain_reward_cta');
  const [tone, setTone] = useState<ScriptTone>('brand'); // tone / persona — defaults to the brand voice
  const [targetS, setTargetS] = useState(30);
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameworks, setFrameworks] = useState<ScriptFrameworks | null>(null);

  useEffect(() => { getFrameworks(30).then(setFrameworks).catch(() => undefined); }, []);

  // ✨ Draft — open the floating agent in the 'audioscript' interview. The agent develops the
  // script WITH the user and authors it via the script.* capabilities (creating one if needed).
  const draftWithAI = () => {
    const seed = [
      brief.trim() && `Brief: ${brief.trim()}`,
      `Format: ${FORMAT_LABELS[format]}`,
      `Tone / persona: ${TONE_LABELS[tone]}`,
      `Target length: ${targetS}s`,
      structure && `Suggested structure: ${structure}`,
    ].filter(Boolean).join('. ');
    dispatch({ type: 'OPEN_FLOATING_AGENT', kind: 'audioscript', brandKitId, seed });
  };

  // ＋ Blank — create a script straight away and lay the chosen structure's beat skeleton.
  const createBlank = async () => {
    setBusy(true); setError(null);
    try {
      const name = brief.trim() ? brief.trim().slice(0, 48) : `${FORMAT_LABELS[format]} script`;
      let s = await createScript({ name, format, targetDurationS: targetS, brandKitId, defaultTone: tone });
      if (structure) s = await applyStructure(s.script_id, structure, targetS);
      dispatch({ type: 'SET_ACTIVE_SCRIPT', script: s });
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally { setBusy(false); }
  };

  const selCls = 'h-[40px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText';

  return (
    <div className="rounded-[8px] border border-ai/40 bg-ai/5">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-[8px] px-[14px] py-[10px] text-left">
        <span className="w-[24px] h-[24px] rounded-[6px] bg-ai/15 text-ai flex items-center justify-center"><IconWave /></span>
        <span className="text-[13px] font-[700] text-ai">Script Director</span>
        <span className="text-[11px] text-textItemBlur flex-1 hidden lg:inline">Develop a short-form script — hook, structure, tone, beats, dialogue. Draft with AI or start blank.</span>
        {active && <span className="text-[11px] text-textItemBlur truncate max-w-[200px]">Active: {active.name}</span>}
        <span className="text-[12px] text-textItemBlur">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-[14px] pb-[14px] flex flex-col gap-[12px]">
      <div className="flex flex-wrap items-end gap-[10px]">
        <label className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-textItemBlur">Format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as ScriptFormat)} className={selCls}>
            {SCRIPT_FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-textItemBlur">Structure</span>
          <select value={structure} onChange={(e) => setStructure(e.target.value as ScriptStructure | '')} className={selCls}>
            <option value="">(none)</option>
            {(frameworks?.structures || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-textItemBlur">Tone / persona</span>
          <select value={tone} onChange={(e) => setTone(e.target.value as ScriptTone)} className={selCls} title="The script's voice — defaults to the active brand's persona">
            {SCRIPT_TONES.map((t) => <option key={t} value={t}>{TONE_LABELS[t]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-textItemBlur">Length (s)</span>
          <input type="number" min={5} max={600} value={targetS} onChange={(e) => setTargetS(Math.max(5, Number(e.target.value) || 30))}
            className={selCls + ' w-[80px]'} />
        </label>
      </div>

      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="What's this script about? Ground it in real Re:InvestorHub features (Deal Analyzer, AI Coach, BRRRR Calculator…)."
        rows={2}
        className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y"
      />

      {error && <div className="text-[12px] text-red-400 leading-[1.4]">{error}</div>}

      <div className="flex items-center gap-[10px]">
        <button type="button" onClick={draftWithAI}
          className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] hover:opacity-90 flex items-center gap-[6px]">
          ✨ Draft with AI
        </button>
        <button type="button" onClick={createBlank} disabled={busy}
          className="h-[40px] px-[16px] rounded-[8px] bg-newBgColorInner border border-newBorder text-btnText text-[13px] font-[600] hover:bg-boxHover disabled:opacity-50">
          {busy ? 'Creating…' : '＋ Blank script'}
        </button>
        <span className="text-[11px] text-textItemBlur hidden lg:inline">Draft = a guided writer interview · Blank = lay the structure skeleton and write it yourself.</span>
      </div>
        </div>
      )}
    </div>
  );
};
