'use client';

// Credits badge — live Higgsfield + Hedra + ElevenLabs balances in the Project bar so you can see
// how many credits you have before any paid generation. Read-only (GET /account/credits). The
// ElevenLabs (audio) leg needs the API key to carry the `user_read` scope; without it the chip
// shows "—" with a tooltip explaining how to enable it.
//
// Refreshes: on mount, on a manual ↻ click, and whenever a generation event fires
// (`reinvestorhub:images-refresh` / `reinvestorhub:credits-refresh`) so the number ticks
// right after a spend. Postiz tokens only; turns amber when a balance runs low.

import { FC, useCallback, useEffect, useState } from 'react';
import { getCredits, CreditsResponse } from '@gitroom/frontend/components/studio/studio.account-client';

// Below these, the chip goes amber as a heads-up (tune as plans change).
const LOW_HIGGSFIELD = 30;
const LOW_HEDRA = 200;
const LOW_ELEVEN = 5000; // ElevenLabs credits = characters; a multi-voice render can be a few hundred.

export const StudioCreditsBadge: FC = () => {
  const [data, setData] = useState<CreditsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getCredits()); } catch { /* leave last-known; transport hiccup */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Tick after any generation (a paid op fires images-refresh) or an explicit credits-refresh.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onRefresh = () => void load();
    window.addEventListener('reinvestorhub:images-refresh', onRefresh);
    window.addEventListener('reinvestorhub:credits-refresh', onRefresh);
    return () => {
      window.removeEventListener('reinvestorhub:images-refresh', onRefresh);
      window.removeEventListener('reinvestorhub:credits-refresh', onRefresh);
    };
  }, [load]);

  const hf = data?.higgsfield;
  const hd = data?.hedra;
  const el = data?.elevenLabs;

  const chip = (
    label: string,
    connected: boolean | undefined,
    value: number | undefined,
    low: number,
    title: string,
  ) => {
    const isLow = connected && typeof value === 'number' && value < low;
    const text = !connected ? '—' : (typeof value === 'number' ? value.toLocaleString() : '—');
    return (
      <span
        className={
          'inline-flex items-center gap-[5px] text-[12px] leading-none whitespace-nowrap ' +
          (isLow ? 'text-amber-400' : 'text-btnText')
        }
        title={title}
      >
        <span className="text-textItemBlur">{label}</span>
        <span className="font-[700]">{text}</span>
      </span>
    );
  };

  return (
    <div className="ml-auto flex items-center gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[6px]"
      title="Generation credits — Higgsfield (images/video), Hedra (talking-head video), ElevenLabs (audio: TTS / multi-voice render / Voice Mirror)">
      {chip(
        '⚡ Higgsfield',
        hf?.connected,
        hf?.credits,
        LOW_HIGGSFIELD,
        hf?.connected ? `Higgsfield: ${hf.credits} credits${hf.plan ? ` · ${hf.plan} plan` : ''}` : `Higgsfield not connected${hf?.error ? `: ${hf.error}` : ''}`,
      )}
      <span className="text-newBorder" aria-hidden="true">|</span>
      {chip(
        '🎬 Hedra',
        hd?.connected,
        hd?.remaining,
        LOW_HEDRA,
        hd?.connected ? `Hedra: ${hd.remaining} credits${hd.expiring ? ` · ${hd.expiring} expiring` : ''}` : `Hedra not connected${hd?.error ? `: ${hd.error}` : ''}`,
      )}
      <span className="text-newBorder" aria-hidden="true">|</span>
      {chip(
        '🗣 ElevenLabs',
        el?.connected,
        el?.remaining,
        LOW_ELEVEN,
        el?.connected
          ? `ElevenLabs: ${el.remaining?.toLocaleString()} credits left${el.limit ? ` of ${el.limit.toLocaleString()}` : ''}${el.plan ? ` · ${el.plan} plan` : ''}${el.resetAt ? ` · resets ${new Date(el.resetAt).toLocaleDateString()}` : ''} — audio: TTS / multi-voice render / Voice Mirror`
          : (el?.error === 'key missing user_read scope'
              ? 'ElevenLabs balance needs the API key to have the user_read scope (add it in the ElevenLabs dashboard → API Keys)'
              : `ElevenLabs not connected${el?.error ? `: ${el.error}` : ''}`),
      )}
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        title="Refresh credits"
        aria-label="Refresh credits"
        className={'text-[12px] text-textItemBlur hover:text-btnText leading-none ' + (loading ? 'animate-spin' : '')}
      >
        ↻
      </button>
    </div>
  );
};
