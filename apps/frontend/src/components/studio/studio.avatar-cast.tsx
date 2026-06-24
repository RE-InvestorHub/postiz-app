'use client';

// Avatar casting — drive a registered clone with a script from the Video tab.
// An avatar is a SOURCE that feeds the existing per-shot backbone: casting calls
// the brain's consent-gated /clone/drive, which applies AI disclosure and stages
// the result as a draft (nothing publishes). Only ACTIVE clones are castable;
// the brain re-asserts consent + eligibility on every drive.
//
// Postiz tokens only; magenta bg-ai accent (AI feature).

import { FC, useCallback, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import {
  listClones,
  driveClone,
} from '@gitroom/frontend/components/studio/studio.clone-client';
import { CloneRecord, StudioResult } from '@gitroom/frontend/components/studio/studio.types';

const selectCls =
  'h-[40px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText';

/** Best-effort extraction of a clip URL from the driveClone result. */
function clipUrl(res: unknown): string | null {
  const clip = (res as { lipSyncClip?: Record<string, unknown> } | null)?.lipSyncClip;
  if (!clip) return null;
  return (clip.url as string) || (clip.outputUrl as string) || (clip.path as string) || null;
}

export const StudioAvatarCast: FC = () => {
  const { state, dispatch } = useStudio();
  const [clones, setClones] = useState<CloneRecord[] | null>(null);
  const [cloneId, setCloneId] = useState('');
  const [brief, setBrief] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    listClones('active')
      .then((list) => {
        setClones(list);
        if (list[0]) setCloneId((id) => id || list[0].clone_id);
      })
      .catch((e: unknown) => setError((e as Error)?.message ?? String(e)));
  }, []);

  const cast = useCallback(async () => {
    if (!cloneId || !brief.trim()) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await driveClone({
        cloneId,
        brief,
        aspectRatio: state.aspectRatio,
        platforms: ['instagram', 'tiktok', 'youtube'],
      });
      const url = clipUrl(res);
      if (url) {
        const result: StudioResult = {
          id: `cast_${Date.now()}`,
          url,
          tab: 'video',
          prompt: `${cloneId}: ${brief.slice(0, 80)}`,
          createdAt: Date.now(),
        };
        dispatch({ type: 'ADD_RESULT', result });
        setMsg('Cast complete — draft clip added below with AI disclosure applied.');
      } else {
        setMsg('Cast dispatched as a draft (AI disclosure applied). The VO + lip-sync clip completes via the pipeline.');
      }
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [cloneId, brief, state.aspectRatio, dispatch]);

  // Empty / no-active-clones state.
  if (clones && clones.length === 0) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] text-[12px] text-textItemBlur leading-[1.5]">
        No active avatars to cast. Register one in the <span className="text-btnText font-[600]">Avatars</span> tab,
        then cast it into a video here.
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px]">
        <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center text-[13px] font-[700]">A</span>
        <span className="text-[14px] font-[600] text-btnText">Cast a registered avatar</span>
      </div>
      <p className="text-[12px] text-textItemBlur leading-[1.5]">
        Drive an active clone with a script. Output is a draft with AI disclosure applied — nothing publishes automatically.
      </p>
      <textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Script / creative brief for the avatar to deliver…"
        rows={3}
        className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y"
      />
      <div className="flex flex-wrap items-center gap-[10px]">
        <select value={cloneId} onChange={(e) => setCloneId(e.target.value)} className={selectCls} disabled={!clones}>
          {!clones && <option>Loading avatars…</option>}
          {clones?.map((c) => (
            <option key={c.clone_id} value={c.clone_id}>{c.person} ({c.clone_id})</option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !cloneId || !brief.trim()}
          onClick={cast}
          className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
        >
          {busy ? 'Casting…' : 'Cast into video'}
        </button>
      </div>
      {error && <div className="text-[12px] text-red-400 leading-[1.4]">{error}</div>}
      {msg && <div className="text-[12px] text-textItemBlur leading-[1.4]">{msg}</div>}
    </div>
  );
};
