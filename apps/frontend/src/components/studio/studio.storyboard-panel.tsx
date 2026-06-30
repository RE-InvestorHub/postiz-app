'use client';

// Generated Storyboard (Plan 8) — direct a gap-fill video gap-by-gap. The numbered keyframes (the
// store's `videoKeyframes`, set via the Library's right-click numbering) lay out left→right; each GAP
// between consecutive frames gets its own direction: a free-text "how should this transition go?" +
// camera move + speed + duration. Generate → gap-fill where each segment uses ITS gap's direction;
// total length = the sum of per-gap durations. The result is ONE concatenated clip in the Video Library.
// Lives on the Video tab (Library ⇄ Storyboard toggle). Postiz tokens only.

import { FC, Fragment, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { StoryboardGap } from '@gitroom/frontend/components/studio/studio.types';
import { gapFillVideo, getVideoCost } from '@gitroom/frontend/components/studio/studio.director-client';

const CAMERA_MOVES = ['subtle', 'slow push-in', 'pull-out', 'pan left', 'pan right', 'tilt up', 'tilt down', 'orbit', 'tracking', 'crane up', 'zoom'];
const SPEEDS = ['slow', 'medium', 'fast'];
const DEFAULT_GAP_DUR = 5;
// Gap-fill morphs between a start AND end frame (a 2-item `medias` array) → only these qualify. Verified:
// kling3_0_turbo + kling2_6 are SINGLE-image only ("medias: at most 1 item"); Veo takes one --image too.
const GAPFILL_MODELS = ['kling3_0', 'seedance_2_0', 'wan2_6'];

export const StudioStoryboardPanel: FC<{ brandKitId: string; videoModel: string }> = ({ brandKitId, videoModel }) => {
  const { state, dispatch } = useStudio();
  const kfs = state.videoKeyframes;
  const gaps = state.storyboardGaps;
  const aspect = state.aspectRatio;
  const [generating, setGenerating] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cost, setCost] = useState<number | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const gapDur = (fromId: string) => Number(gaps[fromId]?.durationS) || DEFAULT_GAP_DUR;
  const between = kfs.slice(0, Math.max(0, kfs.length - 1)); // each is the FROM-frame of a gap
  const totalDur = between.reduce((s, k) => s + gapDur(k.id), 0);
  const gapFillCapable = GAPFILL_MODELS.includes(videoModel);

  const setGap = (fromId: string, field: keyof StoryboardGap, value: string | number) =>
    dispatch({ type: 'SET_GAP_FIELD', fromId, field, value });

  // Live total cost = Σ per-gap clip cost (each gap is one morph segment). Debounced.
  useEffect(() => {
    if (kfs.length < 2) { setCost(null); setCostLoading(false); return; }
    let alive = true;
    setCostLoading(true);
    const t = setTimeout(async () => {
      try {
        const per = await Promise.all(between.map((k) => getVideoCost({ output: 'clip', model: videoModel, duration: gapDur(k.id), aspectRatio: aspect })));
        if (alive) { setCost(Math.round(per.reduce((s, c) => s + (c.credits || 0), 0) * 10) / 10); setCostLoading(false); }
      } catch { if (alive) { setCost(null); setCostLoading(false); } }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(kfs.map((k) => k.id)), JSON.stringify(gaps), videoModel, aspect]);

  const onDrop = (overId: string) => {
    if (!dragId || dragId === overId) { setDragId(null); return; }
    const ids = kfs.map((k) => k.id);
    const from = ids.indexOf(dragId), to = ids.indexOf(overId);
    if (from < 0 || to < 0) { setDragId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    dispatch({ type: 'REORDER_VIDEO_KEYFRAMES', ids });
    setDragId(null);
  };

  const onGenerate = async () => {
    if (kfs.length < 2 || generating) return;
    setError(null); setGenerating(true); setStage('');
    try {
      const directions = between.map((k) => ({ ...(gaps[k.id] || {}), durationS: gapDur(k.id) }));
      await gapFillVideo(brandKitId, kfs.map((k) => k.id), {
        model: videoModel, aspectRatio: aspect, totalDurationS: totalDur, directions,
        onProgress: (job) => { const s = job.segments; if (s?.total) setStage(`segment ${Math.min(s.done + 1, s.total)}/${s.total}`); },
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh'));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setGenerating(false); setStage(''); }
  };

  const fieldCls = 'h-[30px] px-[7px] rounded-[6px] bg-newBgColor border border-newBorder text-[11px] text-btnText w-full';

  if (kfs.length === 0) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] text-[12px] text-textItemBlur">
        No keyframes numbered yet. In the <span className="text-btnText font-[600]">Library</span>, right-click a keyframe → <span className="text-btnText font-[600]">set position</span> to add it to the storyboard (you need ≥2). Make keyframes on the Images tab → mark them ▦.
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-ai/40 bg-ai/5 p-[14px] flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px] flex-wrap">
        <span className="text-[13px] font-[700] text-ai">🎬 Generated Storyboard</span>
        <span className="text-[11px] text-textItemBlur flex-1">Direct each transition between your numbered keyframes, then render one continuous clip.</span>
        {!gapFillCapable && <span className="text-[11px] text-yellow-400">Pick a start→end model (Kling / Seedance / Wan) in the banner.</span>}
      </div>

      {/* The board — keyframe tiles with a direction cell in each gap. Horizontal scroll. */}
      <div className="flex items-stretch gap-[8px] overflow-x-auto pb-[6px]">
        {kfs.map((k, i) => (
          <Fragment key={k.id}>
            <div draggable onDragStart={() => setDragId(k.id)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(k.id)}
              title="Drag to reorder"
              className={'flex-shrink-0 w-[104px] flex flex-col gap-[4px] cursor-grab ' + (dragId === k.id ? 'opacity-50' : '')}>
              <div className="relative aspect-square rounded-[6px] overflow-hidden border border-newBorder">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={k.url} alt={k.label || k.id} className="w-full h-full object-cover pointer-events-none" />
                <span className="absolute top-[3px] left-[3px] h-[18px] min-w-[18px] px-[4px] rounded-[4px] bg-ai text-white text-[10px] font-[700] leading-[18px] text-center">{i + 1}</span>
              </div>
            </div>
            {i < kfs.length - 1 && (
              <div className="flex-shrink-0 w-[190px] flex flex-col gap-[5px] rounded-[6px] border border-newBorder bg-newBgColorInner p-[8px] self-center">
                <span className="text-[10px] font-[700] text-textItemBlur uppercase">Transition {i + 1} → {i + 2}</span>
                <textarea value={gaps[k.id]?.description || ''} onChange={(e) => setGap(k.id, 'description', e.target.value)}
                  rows={2} placeholder="how should this transition go?"
                  className="px-[7px] py-[5px] rounded-[6px] bg-newBgColor border border-newBorder text-[11px] text-btnText placeholder:text-textItemBlur resize-none leading-snug" />
                <div className="flex gap-[5px]">
                  <select value={gaps[k.id]?.movement || 'subtle'} onChange={(e) => setGap(k.id, 'movement', e.target.value)} className={fieldCls} title="Camera move">
                    {CAMERA_MOVES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={gaps[k.id]?.speed || 'slow'} onChange={(e) => setGap(k.id, 'speed', e.target.value)} className={fieldCls + ' w-[78px]'} title="Speed">
                    {SPEEDS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-[6px] text-[10px] font-[600] text-textItemBlur uppercase">
                  Dur
                  <input type="number" min={3} max={10} value={gapDur(k.id)} onChange={(e) => setGap(k.id, 'durationS', Math.max(3, Math.min(10, Number(e.target.value) || DEFAULT_GAP_DUR)))}
                    className="h-[30px] w-[56px] px-[7px] rounded-[6px] bg-newBgColor border border-newBorder text-[11px] text-btnText" />
                  <span className="text-textItemBlur">s</span>
                </label>
              </div>
            )}
          </Fragment>
        ))}
      </div>

      {/* Footer — total length, cost, generate. */}
      <div className="flex items-center gap-[10px] flex-wrap">
        <span className="text-[11px] text-textItemBlur">{kfs.length} keyframes · {kfs.length - 1} transition{kfs.length - 1 === 1 ? '' : 's'} · <span className="text-btnText font-[600]">≈ {totalDur}s</span> total</span>
        {(costLoading || cost != null) && <span className="text-[12px] font-[600] text-textItemBlur">≈ {costLoading ? '…' : cost} cr</span>}
        {error && <span className="text-[11px] text-red-400">{error}</span>}
        <button type="button" disabled={generating || kfs.length < 2 || !gapFillCapable} onClick={onGenerate}
          title={gapFillCapable ? 'Render one continuous clip across your storyboard' : 'Pick a start→end model (Kling/Seedance/Wan) first'}
          className="ml-auto h-[36px] px-[16px] rounded-[8px] bg-ai text-white text-[13px] font-[700] hover:opacity-90 disabled:opacity-50">
          {generating ? `Generating…${stage ? ' ' + stage : ''}` : '⚡ Generate video ($)'}
        </button>
      </div>
    </div>
  );
};
