'use client';

// Scene Director — build an ad shot object-by-object via preset dropdowns, then hand the
// selection to the AI agent to develop into a full spec and render (the ONLY path to a
// render — no direct generate). Lives on the Image tab; renders land in the brand library.
// Each component-backed dimension also offers the brand's SAVED reusable components
// (characters / scenes / lighting / …). Postiz tokens only.

import { FC, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { STUDIO_RESOLUTIONS } from '@gitroom/frontend/components/studio/studio.types';
import { listDirectorDimensions, DirectorDimension, listDirectorTemplates, saveDirectorTemplate, DirectorTemplate, renderDirectorShot, renderDirectorClip, gapFillVideo, getVideoCost, getVideoModelInfo, VideoModelInfo } from '@gitroom/frontend/components/studio/studio.director-client';
import { addKeyframes } from '@gitroom/frontend/components/studio/studio.video-client';
import { SoulControl } from '@gitroom/frontend/components/studio/studio.soul-control';

// Camera-move / speed presets for the video "Motion & video" section (Video context only).
const CAMERA_MOVES = ['static', 'slow push-in', 'pull-out', 'pan left', 'pan right', 'tilt up', 'orbit', 'tracking', 'handheld', 'crane up'];
const MOTION_SPEEDS = ['slow', 'medium', 'fast'];
type DirectorOutput = 'keyframe' | 'clip' | 'video';

// Snap a duration to a model's allowed set (clamp into a range, or nearest enum value). Mirrors the
// brain's snapDuration so the UI never offers a value Higgsfield will reject.
function snapToModel(info: VideoModelInfo | null, d: number): number {
  if (!info) return d;
  const du = info.durations;
  if (du.type === 'enum') return du.values.reduce((a, b) => (Math.abs(b - d) < Math.abs(a - d) ? b : a), du.values[0]);
  return Math.max(du.min, Math.min(du.max, Math.round(d)));
}

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

export const StudioSceneDirector: FC<{ brandKitId: string; context?: 'images' | 'video'; videoModel?: string }> = ({ brandKitId, context = 'images', videoModel = 'kling3_0_turbo' }) => {
  const { state, dispatch } = useStudio();
  const isVideo = context === 'video';
  const [open, setOpen] = useState(false);
  const [dims, setDims] = useState<DirectorDimension[]>([]);
  const [sel, setSel] = useState<Record<string, string>>({}); // dimId -> 'auto' | 'p:<id>' | 'c:<id>'
  const [locked, setLocked] = useState<Record<string, boolean>>({}); // dimId -> locked (agent must not change)
  const [renderMode, setRenderMode] = useState<'layered' | 'single'>('layered');
  const [templates, setTemplates] = useState<DirectorTemplate[]>([]);
  // Video context (the engine): output kind + the Motion & video section + a direct gated generate.
  const [output, setOutput] = useState<DirectorOutput>('keyframe');
  const [movement, setMovement] = useState('slow push-in');
  const [action, setAction] = useState('');
  const [speed, setSpeed] = useState('slow');
  const [durationS, setDurationS] = useState(6);
  const [totalDurationS, setTotalDurationS] = useState(15);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // Free-text "describe it" box — a one-shot prompt woven into the spec (both Images + Video).
  const [description, setDescription] = useState('');
  // Video model metadata (allowed durations + gap-fill capability) + the live cost readout.
  const [modelInfo, setModelInfo] = useState<VideoModelInfo | null>(null);
  const [cost, setCost] = useState<{ credits: number | null; detail?: string } | null>(null);
  const seqIds = state.videoKeyframes.map((k) => k.id);
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

  // Video: load the selected model's allowed durations + gap-fill capability; snap the current
  // duration into the model's valid set so the user can't pick a value Higgsfield will reject.
  useEffect(() => {
    if (!isVideo) return;
    let alive = true;
    getVideoModelInfo(videoModel)
      .then((info) => { if (!alive) return; setModelInfo(info); setDurationS((d) => snapToModel(info, d)); })
      .catch(() => { if (alive) setModelInfo(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, videoModel]);

  // Video: live, output-aware credit cost for the readout (keyframe → image; clip → model×duration;
  // video → segments × per-segment). Refetches whenever an input that affects price changes.
  useEffect(() => {
    if (!isVideo || !open) { setCost(null); return; }
    let alive = true;
    const segs = Math.max(1, seqIds.length - 1);
    getVideoCost({
      output, model: videoModel, aspectRatio: aspect,
      duration: output === 'video' ? totalDurationS : durationS,
      segments: output === 'video' ? segs : undefined,
    }).then((c) => { if (alive) setCost(c); }).catch(() => { if (alive) setCost(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, open, output, videoModel, aspect, durationS, totalDurationS, seqIds.length]);

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
      (description.trim() ? `Free-text brief: ${description.trim()}\n` : '') +
      `Render mode: ${renderMode}. Aspect ratio: ${aspect}. Resolution: ${state.resolution}. When you're confident, the Create button will render it.`;
    dispatch({ type: 'OPEN_FLOATING_AGENT', kind: 'shot', brandKitId, seed });
  };

  // Video context — open the AI interview ('videoshot'). The agent decides keyframe / clip / video WITH
  // the user (default a ~3s clip) and renders via Create. Seeded with the current picks + free text +
  // the selected output / motion / duration / model so the interview builds on them.
  const onDevelopVideo = () => {
    const lines: string[] = [];
    for (const d of dims) {
      const v = sel[d.id];
      if (!v || v === 'auto') continue;
      if (v.startsWith('p:')) { const p = d.presets.find((x) => x.id === v.slice(2)); if (p) lines.push(`- ${d.label}: ${p.label} (${p.fragment})`); }
      else if (v.startsWith('c:')) { const c = d.components.find((x) => x.id === v.slice(2)); if (c) lines.push(`- ${d.label}: reuse saved "${c.name}"${d.component === 'character' ? ` (anchorId: ${c.id})` : ''}`); }
    }
    const motionLine = `Motion: camera ${movement}${action.trim() ? `, action "${action.trim()}"` : ''}, ${speed}.`;
    const seed =
      `I'm directing a VIDEO. My current picks (develop the rest, anything not listed is your call):\n` +
      `${lines.length ? lines.join('\n') : '- (all on Auto — propose a strong concept)'}\n` +
      (description.trim() ? `Free-text brief: ${description.trim()}\n` : '') +
      `Output: ${output} — you can change this with me (default a ~3s clip). ${motionLine} ` +
      `Duration: ${output === 'video' ? totalDurationS : durationS}s. Model: ${videoModel}. Aspect: ${aspect}. ` +
      `For a changing scene / long action / longer video, guide me to compose + number keyframes first, then gap-fill.`;
    dispatch({ type: 'OPEN_FLOATING_AGENT', kind: 'videoshot', brandKitId, seed });
  };

  // Build a fragment-keyed spec (+ the character anchorId) from the dropdown picks — the same shape
  // the agent produces, but direct (used by the Video context's gated generate).
  const buildSpec = (): { spec: Record<string, string>; anchorId: string | null } => {
    const spec: Record<string, string> = {};
    let anchorId: string | null = null;
    for (const d of dims) {
      const v = sel[d.id];
      if (!v || v === 'auto') continue;
      if (v.startsWith('p:')) { const p = d.presets.find((x) => x.id === v.slice(2)); if (p) spec[d.id] = p.fragment; }
      else if (v.startsWith('c:')) {
        const c = d.components.find((x) => x.id === v.slice(2));
        if (c) { spec[d.id] = c.name; if (d.component === 'character') anchorId = c.id; }
      }
    }
    // The free-text box rides along as `description` — the brain prompt-builders weave it in.
    if (description.trim()) spec.description = description.trim();
    return { spec, anchorId };
  };

  const fireVideoRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh')); };

  // Video context — direct, GATED generate. Routes by output: keyframe (still → mark keyframe),
  // clip (single motion), or video (gap-fill across the numbered sequence).
  const onGenerate = async () => {
    setGenError(null);
    const motion = { movement, action: action.trim(), speed };
    if (output === 'video' && seqIds.length < 2) {
      setGenError('Number at least 2 keyframes in the Library (right-click a keyframe → set position) before generating a gap-fill video.');
      return;
    }
    setGenerating(true);
    try {
      if (output === 'keyframe') {
        const { spec, anchorId } = buildSpec();
        const r = await renderDirectorShot(brandKitId, { ...spec, renderMode, aspectRatio: aspect, anchorId });
        await addKeyframes([r.id]); // mark the new still as a keyframe so it lands in the Video Library
      } else if (output === 'clip') {
        const { spec } = buildSpec();
        await renderDirectorClip(brandKitId, spec, { motion, model: videoModel, aspectRatio: aspect, durationS });
      } else {
        const { spec } = buildSpec();
        await gapFillVideo(brandKitId, seqIds, { motion, model: videoModel, aspectRatio: aspect, totalDurationS, style: spec.style });
      }
      fireVideoRefresh();
    } catch (e) { setGenError((e as Error)?.message ?? String(e)); }
    finally { setGenerating(false); }
  };

  // Images context — direct, GATED one-shot generate. Renders a still from the picks + free text and
  // drops it straight into the brand image library (no agent interview). Mirrors the Video keyframe path.
  const fireImagesRefresh = (selectImageId?: string) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh', { detail: selectImageId ? { selectImageId } : {} })); };
  const fireImagesGenerating = (active: boolean) => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-generating', { detail: { active } })); };
  const onGenerateImage = async () => {
    setGenError(null);
    setGenerating(true);
    fireImagesGenerating(true);
    try {
      const { spec, anchorId } = buildSpec();
      const r = await renderDirectorShot(brandKitId, { ...spec, renderMode, aspectRatio: aspect, anchorId });
      fireImagesRefresh(r.id);
    } catch (e) { setGenError((e as Error)?.message ?? String(e)); }
    finally { setGenerating(false); fireImagesGenerating(false); }
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
            {/* Free-text "describe it" — fills the trailing cells of the bottom row (spans 2 columns).
                A one-shot prompt woven into the spec alongside the structured picks. */}
            <label className="flex flex-col gap-[3px] col-span-2">
              <span className="text-[11px] font-[600] text-btnText flex-1" title="Free-text prompt — merged with your picks and sent to the model. Leave blank to rely on the dropdowns.">
                Describe it — free prompt
              </span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder={isVideo ? 'e.g. the founder walking through a sunlit downtown loft, confident' : 'e.g. a golden retriever in sunglasses on a sunny beach, product on a towel'}
                rows={2}
                className="px-[8px] py-[6px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText placeholder:text-textItemBlur w-full resize-none leading-snug" />
            </label>
          </div>

          {/* Render / Output row — on Video the Output toggle is inline here (with Render/aspect/res). */}
          <div className="flex flex-wrap items-center gap-[10px]">
            {isVideo && (
              <>
                <span className="text-[11px] font-[700] text-ai">Output</span>
                <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden">
                  {([['keyframe', '▦ Keyframe'], ['clip', '▶ Clip'], ['video', '🎬 Video']] as [DirectorOutput, string][]).map(([o, lbl]) => (
                    <button key={o} type="button" onClick={() => setOutput(o)}
                      title={o === 'keyframe' ? 'Compose a still → adds it to the keyframe pool' : o === 'clip' ? 'Generate one motion clip' : 'Gap-fill the numbered keyframe sequence into a short'}
                      className={'h-[32px] px-[12px] text-[12px] font-[600] ' + (output === o ? 'bg-ai text-white' : 'text-textItemBlur hover:text-btnText')}>{lbl}</button>
                  ))}
                </span>
                <span className="w-px h-[20px] bg-newBorder" />
              </>
            )}
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
            {isVideo ? (
              <span className="ml-auto flex items-center gap-[8px]">
                {/* Live, output-aware credit cost — updates on model / duration / output change. */}
                {cost?.credits != null && (
                  <span title={cost.detail || 'Estimated credits'} className="text-[12px] font-[600] text-textItemBlur whitespace-nowrap">≈ {cost.credits} cr</span>
                )}
                <button type="button" onClick={onDevelopVideo}
                  title="Open the AI agent — it interviews you, settles keyframe / clip / video, then Create renders it"
                  className="h-[36px] px-[14px] rounded-[8px] border border-ai/60 text-ai text-[13px] font-[700] hover:bg-ai/10">
                  ✨ Develop with AI
                </button>
                <button type="button" disabled={generating} onClick={onGenerate}
                  title="One-off render from your current settings (output + duration + picks + free text)"
                  className="h-[36px] px-[16px] rounded-[8px] bg-ai text-white text-[13px] font-[700] hover:opacity-90 disabled:opacity-50">
                  {generating ? 'Generating…' : output === 'keyframe' ? '⚡ Generate keyframe' : '⚡ Generate ($)'}
                </button>
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-[8px]">
                <button type="button" onClick={onDevelop}
                  title="Open the AI agent — it asks a few questions, then the Create button renders"
                  className="h-[36px] px-[14px] rounded-[8px] border border-ai/60 text-ai text-[13px] font-[700] hover:bg-ai/10">
                  ✨ Develop with AI
                </button>
                <button type="button" disabled={generating} onClick={onGenerateImage}
                  title="One-shot render from your picks + free text — straight to the image library (uses image credits)"
                  className="h-[36px] px-[16px] rounded-[8px] bg-ai text-white text-[13px] font-[700] hover:opacity-90 disabled:opacity-50">
                  {generating ? 'Generating…' : '⚡ Generate ($)'}
                </button>
              </span>
            )}
          </div>

          {/* Motion & video — Clip/Video only (stills don't move); the video model lives in the banner above. */}
          {isVideo && output !== 'keyframe' && (
            <div className="flex flex-wrap items-end gap-[8px]">
              <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Camera move</span>
                <select value={movement} onChange={(e) => setMovement(e.target.value)} className="h-[34px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText">{CAMERA_MOVES.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Action</span>
                <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="subject motion (optional)" className="h-[34px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText placeholder:text-textItemBlur w-[170px]" /></label>
              <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Speed</span>
                <select value={speed} onChange={(e) => setSpeed(e.target.value)} className="h-[34px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText">{MOTION_SPEEDS.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
              {output === 'clip' ? (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Duration {durationS}s</span>
                  {/* Model-aware: enum models (Veo 4/6/8, Wan 5/10/15, …) get a dropdown; range models a slider. */}
                  {modelInfo?.durations.type === 'enum' ? (
                    <select value={durationS} onChange={(e) => setDurationS(Number(e.target.value))}
                      className="h-[34px] px-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText">
                      {modelInfo.durations.values.map((v) => <option key={v} value={v}>{v}s</option>)}
                    </select>
                  ) : (
                    <input type="range" min={modelInfo?.durations.type === 'range' ? modelInfo.durations.min : 3}
                      max={modelInfo?.durations.type === 'range' ? modelInfo.durations.max : 10}
                      step={modelInfo?.durations.type === 'range' ? modelInfo.durations.step : 1}
                      value={durationS} onChange={(e) => setDurationS(Number(e.target.value))} className="h-[34px] w-[110px]" />
                  )}</label>
              ) : (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Total {totalDurationS}s</span>
                  <input type="range" min={4} max={30} step={1} value={totalDurationS} onChange={(e) => setTotalDurationS(Number(e.target.value))} className="h-[34px] w-[110px]" /></label>
              )}
              {output === 'video' && modelInfo && !modelInfo.gapFill && (
                <span className="text-[11px] text-yellow-400 self-center">Gap-fill needs a start→end model — pick Kling / Seedance / Wan in the banner.</span>
              )}
            </div>
          )}
          {isVideo && output === 'video' && (
            <span className="text-[11px] text-textItemBlur">{seqIds.length} keyframe{seqIds.length === 1 ? '' : 's'} numbered{seqIds.length < 2 ? ' — number ≥2 (right-click a keyframe in the Library) to gap-fill' : ''}</span>
          )}
          {genError && <span className="text-[11px] text-red-400">{genError}</span>}

          <span className="text-[10px] text-textItemBlur">
            {isVideo
              ? '⚡ Generate = one-off from your current settings (the Output toggle picks keyframe / clip / video). ✨ Develop with AI = an interview that settles the output with you (default a ~3s clip) and guides you to keyframes-first for longer / changing-scene videos. Clip + Video spend video credits.'
              : 'The agent asks a few questions, then the Create button renders it (uses image credits). Your picks seed the conversation; anything on Auto, it proposes.'}
          </span>
        </div>
      )}
    </div>
  );
};
