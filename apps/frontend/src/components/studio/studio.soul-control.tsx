'use client';

// Soul control — promote a saved Scene Director character to a trained Higgsfield Soul so its
// EXACT identity is reused across campaigns (hard lock), and remove it again. Shows training status.
//
// Promote SPENDS credits (reference sheet + Soul training) → confirms with a credit estimate + the
// live balance + a time expectation BEFORE firing. Training is NON-BLOCKING: it kicks the job and
// the global SoulTrainingWatcher notifies on completion (works from any tab). Remove clears the link
// + local training frames (no spend); it cannot delete the Higgsfield-side Soul (their CLI has no
// delete) — the confirm says so. Synthetic brand characters only. Postiz tokens; magenta AI accent.

import { FC, useCallback, useEffect, useState } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { getSoulStatus, startSoulTraining, removeSoul, anchorForImage, SoulStatus } from '@gitroom/frontend/components/studio/studio.director-client';
import { getCredits } from '@gitroom/frontend/components/studio/studio.account-client';

// Rough estimate shown in the confirm: 8-frame reference sheet (~16 cr) + Soul training (~25 cr).
const EST_CREDITS = 41;

export const SoulControl: FC<{ anchorId: string; name?: string; variant?: 'inline' | 'button' }> = ({ anchorId, name, variant = 'inline' }) => {
  const toaster = useToaster();
  const [status, setStatus] = useState<SoulStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setStatus(await getSoulStatus(anchorId)); } catch { /* leave last-known */ }
  }, [anchorId]);

  useEffect(() => { void refresh(); }, [refresh]);
  // The global watcher fires soul-refresh on completion/removal → update our pill.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRefresh = () => void refresh();
    window.addEventListener('reinvestorhub:soul-refresh', onRefresh);
    return () => window.removeEventListener('reinvestorhub:soul-refresh', onRefresh);
  }, [refresh]);

  const promote = useCallback(async () => {
    if (busy) return;
    // Pull the live Higgsfield balance so the warning shows what they have vs. what it costs.
    let balanceLine = '';
    try {
      const c = await getCredits();
      if (c.higgsfield?.connected && typeof c.higgsfield.credits === 'number') {
        balanceLine = `\n\nYou have ${c.higgsfield.credits} Higgsfield credits.` +
          (c.higgsfield.credits < EST_CREDITS ? ' ⚠️ This may be more than your balance.' : '');
      }
    } catch { /* show the estimate without a balance */ }

    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Promote "${name || 'this character'}" to a trained Soul?\n\n` +
      `Cost: about ${EST_CREDITS} Higgsfield credits (≈16 for an 8-frame reference sheet + ≈25 to train the Soul).` +
      balanceLine +
      `\n\nTraining takes ~8–15 minutes and runs in the background — you can keep working; ` +
      `you'll get a notification when it's ready. After that, every Scene Director shot of this ` +
      `character keeps the exact same identity.`
    );
    if (!ok) return;

    setBusy(true);
    setStatus((s) => ({ ...(s as SoulStatus), anchorId, soul_status: 'training', soul_id: s?.soul_id ?? null }));
    try {
      await startSoulTraining(anchorId, 'soul-2');
      if (typeof window !== 'undefined') {
        // Register with the global watcher so completion is notified even if we navigate away.
        window.dispatchEvent(new CustomEvent('reinvestorhub:soul-training-started', { detail: { anchorId, name } }));
        window.dispatchEvent(new CustomEvent('reinvestorhub:credits-refresh'));
      }
      toaster.show(`Training "${name || 'character'}" Soul — ~8–15 min. You'll be notified when it's ready.`, 'success');
    } catch (e) {
      setStatus((s) => ({ ...(s as SoulStatus), soul_status: null }));
      toaster.show(`Could not start Soul training: ${(e as Error)?.message ?? String(e)}`, 'warning');
    } finally {
      setBusy(false);
    }
  }, [anchorId, name, busy, toaster]);

  const remove = useCallback(async () => {
    if (busy) return;
    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Remove the Soul from "${name || 'this character'}"?\n\n` +
      `This clears the Soul link (new shots go back to reference-based likeness) and deletes the ` +
      `local training frames. The character and any shots you already made are kept.\n\n` +
      `Note: the trained Soul still lives in your Higgsfield account — Higgsfield's API has no delete, ` +
      `so remove it from the Higgsfield dashboard if you want it gone (idle Souls don't cost anything).`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const r = await removeSoul(anchorId);
      setStatus({ anchorId, soul_id: null, soul_status: null });
      toaster.show(r.higgsfieldNote ? `Soul removed here. ${r.higgsfieldNote}` : 'Soul removed.', 'success');
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:soul-refresh'));
    } catch (e) {
      toaster.show(`Could not remove the Soul: ${(e as Error)?.message ?? String(e)}`, 'warning');
    } finally {
      setBusy(false);
    }
  }, [anchorId, name, busy, toaster]);

  const st = status?.soul_status;
  const btn = variant === 'button';
  // Button variant matches the canvas action row (h-36); inline is the tiny Scene Director pill.
  const promoteCls = btn
    ? 'h-[36px] px-[14px] rounded-[8px] border border-ai/40 text-ai text-[12px] font-[600] hover:bg-ai/10 inline-flex items-center gap-[4px]'
    : 'inline-flex items-center gap-[3px] text-[10px] font-[600] text-ai opacity-80 hover:opacity-100 leading-none';
  const sz = btn ? 'text-[12px]' : 'text-[10px]';

  if (st === 'ready') {
    return (
      <span className={'inline-flex items-center gap-[4px] leading-none ' + (btn ? 'h-[36px] px-[12px] rounded-[8px] border border-ai/40' : '')}>
        <span className={'font-[700] text-ai ' + sz} title="Identity-locked: shots of this character use the trained Soul">🔒 Soul</span>
        <button type="button" onClick={(e) => { e.preventDefault(); void remove(); }} disabled={busy}
          title="Remove this Soul (clears the link + training frames; the Higgsfield Soul stays in your account)"
          className={'text-textItemBlur hover:text-red-400 leading-none ' + sz}>✕</button>
      </span>
    );
  }
  if (busy || st === 'training') {
    return <span className={'inline-flex items-center gap-[3px] text-textItemBlur leading-none ' + sz + (btn ? ' h-[36px] px-[12px] rounded-[8px] border border-newBorder' : '')} title="Training the Soul (~8–15 min) — you'll be notified when it's ready"><span className="animate-spin">↻</span> training…</span>;
  }
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); void promote(); }}
      title={`Promote to a trained Soul ID (~${EST_CREDITS} credits) — locks this character's identity across campaigns`}
      className={promoteCls}>⭐ {btn ? 'Capture Soul' : 'Soul'}</button>
  );
};

/**
 * Canvas Capture-Soul button — sits next to "Save as component". DIMMED with an instructional
 * tooltip until the selected image has been saved as a Character; then it becomes the live
 * SoulControl (button variant) for that character.
 */
export const CanvasSoulButton: FC<{ imageId: string }> = ({ imageId }) => {
  const [anchor, setAnchor] = useState<{ anchorId: string; name: string } | null>(null);

  const resolve = useCallback(async () => {
    try {
      const a = await anchorForImage(imageId);
      setAnchor(a?.anchorId ? { anchorId: a.anchorId, name: a.name } : null);
    } catch { setAnchor(null); }
  }, [imageId]);

  useEffect(() => { void resolve(); }, [resolve]);
  // Re-resolve when a component is saved (director-refresh) or a soul changes (soul-refresh).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => void resolve();
    window.addEventListener('reinvestorhub:director-refresh', on);
    window.addEventListener('reinvestorhub:soul-refresh', on);
    return () => {
      window.removeEventListener('reinvestorhub:director-refresh', on);
      window.removeEventListener('reinvestorhub:soul-refresh', on);
    };
  }, [resolve]);

  if (!anchor) {
    return (
      <button type="button" disabled
        title="Lock this person's identity across campaigns. First click ★ Save as component → choose Character → give it a name. Then this button trains a reusable Soul of that character."
        className="h-[36px] px-[14px] rounded-[8px] border border-newBorder text-textItemBlur text-[12px] font-[600] opacity-50 cursor-not-allowed inline-flex items-center gap-[4px]">⭐ Capture Soul</button>
    );
  }
  return <SoulControl anchorId={anchor.anchorId} name={anchor.name} variant="button" />;
};
