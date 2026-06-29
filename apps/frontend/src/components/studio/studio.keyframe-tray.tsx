'use client';

// Keyframe tray — the ordered, ephemeral staging strip on the Video tab. Holds the keyframes a
// user has sent over (Images→Video bridge), pulled from the Library, or directed via Scene Director
// on Video. Distinct from the Library (the persistent store): this is "what I'm about to generate".
// Drag tiles to reorder; ✕ removes one; Clear empties it. The gap-fill generator (Plan 2) consumes
// this order. Postiz tokens only; native HTML5 drag (no new deps).

import { FC, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';

export const StudioKeyframeTray: FC = () => {
  const { state, dispatch } = useStudio();
  const frames = state.videoKeyframes;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const ids = frames.map((f) => f.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return; }
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    dispatch({ type: 'REORDER_VIDEO_KEYFRAMES', ids });
    setDragId(null); setOverId(null);
  };

  return (
    <div className="rounded-[8px] border border-ai/40 bg-ai/5 p-[12px] flex flex-col gap-[10px]">
      <div className="flex items-center gap-[8px]">
        <span className="text-[13px] font-[700] text-ai">▦ Keyframe sequence</span>
        <span className="text-[11px] text-textItemBlur flex-1">
          {frames.length
            ? `${frames.length} staged for the next render — drag to set order. The gap-fill generator fills the motion between them.`
            : 'The ordered frames for your next video. Add them from the Library’s Keyframes, the Images tab (Select → Send to Video), or Scene Director.'}
        </span>
        {frames.length > 0 && (
          <button type="button" onClick={() => dispatch({ type: 'CLEAR_VIDEO_KEYFRAMES' })}
            className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur hover:text-btnText">Clear</button>
        )}
      </div>

      {frames.length === 0 ? (
        <div className="h-[72px] rounded-[8px] border border-dashed border-newBorder flex items-center justify-center text-[12px] text-textItemBlur">
          No keyframes staged yet.
        </div>
      ) : (
        <div className="flex gap-[8px] overflow-x-auto pb-[4px]">
          {frames.map((f, i) => (
            <div
              key={f.id}
              draggable
              onDragStart={() => setDragId(f.id)}
              onDragOver={(e) => { e.preventDefault(); setOverId(f.id); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              onDrop={() => onDrop(f.id)}
              title={f.label || f.id}
              className={'relative shrink-0 w-[96px] h-[96px] rounded-[8px] overflow-hidden border bg-newBgColor cursor-grab active:cursor-grabbing '
                + (overId === f.id && dragId !== f.id ? 'border-ai ring-1 ring-ai' : 'border-newBorder')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.label || f.id} className="w-full h-full object-cover pointer-events-none" />
              <span className="absolute top-[3px] left-[3px] h-[16px] min-w-[16px] px-[3px] rounded-[4px] bg-black/60 text-white text-[10px] font-[700] leading-[16px] text-center">{i + 1}</span>
              <button type="button" onClick={() => dispatch({ type: 'REMOVE_VIDEO_KEYFRAME', id: f.id })}
                title="Remove from tray"
                className="absolute top-[3px] right-[3px] h-[16px] w-[16px] rounded-[4px] bg-black/60 text-white text-[10px] leading-none flex items-center justify-center hover:bg-[#ff7eb6] hover:text-[#3a0d23]">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudioKeyframeTray;
