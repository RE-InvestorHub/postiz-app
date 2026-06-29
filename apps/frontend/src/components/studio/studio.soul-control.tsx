'use client';

// Soul control — promote a saved Scene Director character to a trained Higgsfield Soul so its
// EXACT identity is reused across campaigns (hard lock). Shows the training status and the ⭐
// Promote action. SPENDS credits (reference sheet + Soul training) → confirms before firing.
// Synthetic brand characters only. Postiz tokens; magenta AI accent (it's an AI feature).

import { FC, useCallback, useEffect, useState } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { getSoulStatus, trainSoul, SoulStatus } from '@gitroom/frontend/components/studio/studio.director-client';

export const SoulControl: FC<{ anchorId: string; name?: string }> = ({ anchorId, name }) => {
  const toaster = useToaster();
  const [status, setStatus] = useState<SoulStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try { setStatus(await getSoulStatus(anchorId)); } catch { /* leave last-known */ }
  }, [anchorId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const promote = useCallback(async () => {
    if (busy) return;
    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Promote "${name || 'this character'}" to a trained Soul?\n\n` +
      `This spends credits: it generates an 8-frame reference sheet (~16 cr) and trains the Soul ` +
      `(billed at run time). Training takes a few minutes. Afterward, every Scene Director shot of ` +
      `this character keeps the exact same identity.`
    );
    if (!ok) return;
    setBusy(true);
    setStatus((s) => ({ ...(s as SoulStatus), anchorId, soul_status: 'training', soul_id: s?.soul_id ?? null }));
    try {
      const r = await trainSoul(anchorId, 'soul-2');
      setStatus({ anchorId, soul_id: r.soul_id, soul_status: 'ready', soul_model: r.soul_model });
      toaster.show('Soul trained — this character is now identity-locked across campaigns.', 'success');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh'));
        window.dispatchEvent(new CustomEvent('reinvestorhub:credits-refresh'));
      }
    } catch (e) {
      setStatus((s) => ({ ...(s as SoulStatus), soul_status: null }));
      toaster.show(`Soul training failed: ${(e as Error)?.message ?? String(e)}`, 'warning');
    } finally {
      setBusy(false);
    }
  }, [anchorId, name, busy, toaster]);

  const st = status?.soul_status;

  if (st === 'ready') {
    return <span className="inline-flex items-center gap-[3px] text-[10px] font-[700] text-ai leading-none" title="Identity-locked: shots of this character use the trained Soul">🔒 Soul</span>;
  }
  if (busy || st === 'training') {
    return <span className="inline-flex items-center gap-[3px] text-[10px] text-textItemBlur leading-none" title="Training the Soul — this takes a few minutes"><span className="animate-spin">↻</span> training…</span>;
  }
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); void promote(); }}
      title="Promote to a trained Soul ID (spends credits) — locks this character's identity across campaigns"
      className="inline-flex items-center gap-[3px] text-[10px] font-[600] text-ai opacity-80 hover:opacity-100 leading-none">⭐ Soul</button>
  );
};
