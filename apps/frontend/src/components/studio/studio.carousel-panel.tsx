'use client';

// Carousel composer — an ordered set of branded slides (Generate → Project → Compose).
// Each slide binds one of the active Ad's images + its own copy; render at one aspect.
// Reuses the still compositing per slide. Magenta bg-ai = Compose; purple bg-btnPrimary
// = Add-to-ad. Postiz tokens. Backend: /compose/carousel.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, addObject, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  listBrandKits, listComposerChannels, composeCarousel, assetUrl,
  BrandKit, Channel, CarouselResult,
} from '@gitroom/frontend/components/studio/studio.composer-client';

const Spinner: FC<{ size?: number }> = ({ size = 18 }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
function srcUrl(rec: any): string | null { if (!rec) return null; if (rec.path) return assetUrl(rec.path); if (rec.cdnUrl) return rec.cdnUrl; return null; }
const inputCls = 'h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';

interface SlideDraft { imageId: string; headline: string; cta: string }

export const StudioCarouselPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';

  const [images, setImages] = useState<ResolvedObject[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channel, setChannel] = useState('ig_portrait');
  const [slides, setSlides] = useState<SlideDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<CarouselResult[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!state.activeAdId) { setImages([]); return; }
    setError(null);
    try {
      const [objs, k, ch] = await Promise.all([getAdObjects(state.activeAdId), listBrandKits(), listComposerChannels()]);
      const imgs = objs.filter((o) => o.type === 'image');
      setImages(imgs); setKits(k); setChannels(ch);
      setSlides((cur) => (cur.length || !imgs[0] ? cur : [{ imageId: imgs[0].id, headline: '', cta: '' }]));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [state.activeAdId]);
  useEffect(() => { void load(); }, [load]);

  const imgUrl = (id: string) => srcUrl(images.find((o) => o.id === id)?.record);
  const addSlide = () => setSlides((s) => [...s, { imageId: images[0]?.id || '', headline: '', cta: '' }]);
  const patchSlide = (i: number, p: Partial<SlideDraft>) => setSlides((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const removeSlide = (i: number) => setSlides((s) => s.filter((_, j) => j !== i));

  const canCompose = useMemo(() => slides.length > 0 && slides.every((s) => s.imageId) && !busy, [slides, busy]);

  const doCompose = useCallback(async () => {
    if (!canCompose) return;
    setBusy(true); setError(null); setResults([]); setAddedIds(new Set());
    try {
      const resp = await composeCarousel({
        adId: state.activeAdId ?? undefined, brandKitId, channel,
        slides: slides.map((s) => ({ imageRef: s.imageId, copy: { headline: s.headline.trim() || undefined, cta: s.cta.trim() || undefined } })),
      });
      setResults(resp.slides);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [canCompose, slides, channel, brandKitId, state.activeAdId]);

  const addToAd = useCallback(async (id: string) => {
    if (!state.activeAdId) return;
    try { await addObject({ adId: state.activeAdId, type: 'image', id }); setAddedIds((s) => new Set(s).add(id)); } catch { /* */ }
  }, [state.activeAdId]);

  if (!state.activeCampaignId || !state.activeAdId)
    return <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">Select a Campaign + Ad in the Project bar first.</div>;
  if (images.length === 0)
    return <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">This Ad has no images yet — add some in Images first.</div>;

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px]">
          <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center font-[700]">▦</span>
          <span className="text-[14px] font-[600] text-btnText">Compose a Carousel</span>
          <div className="ml-auto flex items-center gap-[8px]">
            <select value={brandKitId} onChange={(e) => dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: e.target.value })} className={inputCls}>
              {kits.map((k) => (<option key={k.brand_kit_id} value={k.brand_kit_id}>{k.name}</option>))}
            </select>
            <select value={channel} onChange={(e) => setChannel(e.target.value)} className={inputCls} title="Carousel aspect">
              {channels.map((c) => (<option key={c.id} value={c.id}>{c.aspect}</option>))}
            </select>
          </div>
        </div>

        {slides.map((s, i) => (
          <div key={i} className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px] flex flex-col gap-[8px]">
            <div className="flex items-center gap-[8px]">
              <span className="text-[12px] font-[600] text-textItemBlur">Slide {i + 1}</span>
              <button type="button" onClick={() => removeSlide(i)} className="ml-auto text-[11px] text-[#ff7eb6] hover:underline">remove</button>
            </div>
            <div className="grid grid-cols-4 minCustom:grid-cols-6 gap-[6px]">
              {images.map((o) => {
                const u = srcUrl(o.record); const sel = s.imageId === o.id;
                return (
                  <button key={o.id} type="button" onClick={() => patchSlide(i, { imageId: o.id })}
                    className={`rounded-[6px] overflow-hidden border-2 ${sel ? 'border-ai' : 'border-newBorder'} aspect-square`} title={o.id}>
                    {u ? <img src={u} alt={o.id} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-[10px] text-textItemBlur">img</span>}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-[8px]">
              <input value={s.headline} onChange={(e) => patchSlide(i, { headline: e.target.value })} placeholder="Slide headline" className={`${inputCls} flex-1`} />
              <input value={s.cta} onChange={(e) => patchSlide(i, { cta: e.target.value })} placeholder="CTA (optional)" className={`${inputCls} w-[160px]`} />
            </div>
          </div>
        ))}

        <div className="flex items-center gap-[8px]">
          <button type="button" onClick={addSlide} className="h-[34px] px-[12px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600]">+ Add slide</button>
          <button type="button" disabled={!canCompose} onClick={doCompose}
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 ml-auto flex items-center gap-[8px]">
            {busy ? <><Spinner /> Composing…</> : `Compose ${slides.length} slide${slides.length === 1 ? '' : 's'}`}
          </button>
        </div>
        {error && <div className="text-[12px] text-red-400">{error}</div>}
      </div>

      {results.length > 0 && (
        <div className="grid grid-cols-2 minCustom:grid-cols-4 gap-[12px]">
          {results.map((r) => (
            <div key={r.id} className="rounded-[8px] overflow-hidden border border-newBorder flex flex-col bg-newBgColorInner">
              <a href={r.url} target="_blank" rel="noreferrer"><img src={r.url} alt={`slide ${r.slide}`} className="w-full h-auto" /></a>
              <div className="px-[8px] py-[4px] text-[11px] text-textItemBlur">Slide {r.slide}</div>
              <button type="button" disabled={addedIds.has(r.id)} onClick={() => addToAd(r.id)}
                className="h-[28px] text-[12px] font-[600] text-white bg-btnPrimary disabled:opacity-50 border-t border-newBorder">
                {addedIds.has(r.id) ? 'Added ✓' : '+ Add to ad'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
