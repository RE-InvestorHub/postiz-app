'use client';

// Email composer — a brand-styled HTML email (Generate → Project → Compose).
// Optional hero image from the active Ad + headline/sub/body/CTA → a self-contained
// HTML deliverable, previewed inline. Postiz tokens. Backend: /compose/email.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { listBrandKits, composeEmail, assetUrl, BrandKit } from '@gitroom/frontend/components/studio/studio.composer-client';

const Spinner: FC<{ size?: number }> = ({ size = 18 }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
function srcUrl(rec: any): string | null { if (!rec) return null; if (rec.path) return assetUrl(rec.path); if (rec.cdnUrl) return rec.cdnUrl; return null; }
const inputCls = 'h-[40px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';

export const StudioEmailPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';

  const [images, setImages] = useState<ResolvedObject[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [heroId, setHeroId] = useState('');
  const [headline, setHeadline] = useState('');
  const [sub, setSub] = useState('');
  const [body, setBody] = useState('');
  const [cta, setCta] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: string; url: string } | null>(null);

  const load = useCallback(async () => {
    if (!state.activeAdId) { setImages([]); return; }
    try { const [objs, k] = await Promise.all([getAdObjects(state.activeAdId), listBrandKits()]); setImages(objs.filter((o) => o.type === 'image')); setKits(k); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [state.activeAdId]);
  useEffect(() => { void load(); }, [load]);

  const canCompose = useMemo(() => !!headline.trim() && !busy, [headline, busy]);

  const doCompose = useCallback(async () => {
    if (!headline.trim()) return;
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await composeEmail({
        adId: state.activeAdId ?? undefined, brandKitId,
        ...(heroId ? { heroRef: heroId } : {}),
        copy: { headline: headline.trim(), sub: sub.trim() || undefined, body: body.trim() || undefined, cta: cta.trim() || undefined, ctaUrl: ctaUrl.trim() || undefined },
      });
      setResult({ id: r.id, url: r.url });
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [headline, sub, body, cta, ctaUrl, heroId, brandKitId, state.activeAdId]);

  if (!state.activeCampaignId || !state.activeAdId)
    return <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">Select a Campaign + Ad in the Project bar first.</div>;

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px]">
          <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center font-[700]">✉</span>
          <span className="text-[14px] font-[600] text-btnText">Compose an Email</span>
          <select value={brandKitId} onChange={(e) => dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: e.target.value })} className={`${inputCls} ml-auto`}>
            {kits.map((k) => (<option key={k.brand_kit_id} value={k.brand_kit_id}>{k.name}</option>))}
          </select>
        </div>

        {images.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Hero image (optional)</span>
            <div className="grid grid-cols-4 minCustom:grid-cols-6 gap-[6px]">
              <button type="button" onClick={() => setHeroId('')} className={`rounded-[6px] border-2 ${heroId === '' ? 'border-ai' : 'border-newBorder'} aspect-square flex items-center justify-center text-[11px] text-textItemBlur`}>none</button>
              {images.map((o) => {
                const u = srcUrl(o.record); const sel = heroId === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => setHeroId(o.id)} className={`rounded-[6px] overflow-hidden border-2 ${sel ? 'border-ai' : 'border-newBorder'} aspect-square`} title={o.id}>
                    {u ? <img src={u} alt={o.id} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-[10px] text-textItemBlur">img</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (required)" className={`${inputCls} w-full`} />
        <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Sub / preheader (optional)" className={`${inputCls} w-full`} />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="Body (optional; newlines become line breaks)"
          className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y" />
        <div className="flex gap-[8px]">
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="CTA label (optional)" className={`${inputCls} flex-1`} />
          <input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="CTA url" className={`${inputCls} flex-1`} />
        </div>

        <button type="button" disabled={!canCompose} onClick={doCompose}
          className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 self-end flex items-center gap-[8px]">
          {busy ? <><Spinner /> Composing…</> : 'Compose email'}
        </button>
        {error && <div className="text-[12px] text-red-400">{error}</div>}
      </div>

      {result && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColorInner flex flex-col overflow-hidden">
          <div className="flex items-center gap-[10px] px-[12px] py-[8px]">
            <span className="text-[13px] font-[600] text-btnText">Preview</span>
            <a href={result.url} target="_blank" rel="noreferrer" className="ml-auto text-[12px] font-[600] text-btnText hover:underline">open</a>
            <a href={result.url} download className="text-[12px] font-[600] text-btnText hover:underline">download .html</a>
          </div>
          <iframe src={result.url} title="email preview" className="w-full h-[520px] bg-white border-0" />
        </div>
      )}
    </div>
  );
};
