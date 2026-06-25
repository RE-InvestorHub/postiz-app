'use client';

// Composer tab — the first Generate → Project → COMPOSE deliverable: a Still post.
// Pick a source image from the active Ad, lay headline / sub / CTA + data callouts
// + brand over it, and render one branded still PER channel. Brand comes from a
// swappable Brand Kit (the campaign's, or pick one here). Compose is the AI/render
// action (magenta bg-ai); Add-to-ad is manual curation (purple bg-btnPrimary).
// Postiz tokens only. Backend: /compose/* + /brandkits (see studio.composer-client).

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, addObject, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  listBrandKits, listComposerChannels, composeStill, assetUrl,
  BrandKit, Channel, ComposeResult, DataCallout,
} from '@gitroom/frontend/components/studio/studio.composer-client';

const Spinner: FC<{ size?: number }> = ({ size = 18 }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

function srcUrl(rec: any): string | null {
  if (!rec) return null;
  if (rec.path) return assetUrl(rec.path);
  if (rec.cdnUrl) return rec.cdnUrl;
  return null;
}

const inputCls =
  'h-[40px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';

export const StudioComposerPanel: FC = () => {
  const { state, dispatch } = useStudio();

  const [images, setImages] = useState<ResolvedObject[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  const [sourceId, setSourceId] = useState<string>('');
  // Brand kit lives in the store so the agent's compose.selectBrandKit reflects here.
  const brandKitId = state.composerBrandKitId || 'default';
  const setBrandKitId = (id: string) => dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: id });
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(['ig_square']));
  const [headline, setHeadline] = useState('');
  const [sub, setSub] = useState('');
  const [cta, setCta] = useState('');
  const [data, setData] = useState<DataCallout[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ComposeResult[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  // Load the Ad's image objects + brand kits + channels when the Ad changes.
  const load = useCallback(async () => {
    if (!state.activeAdId) { setImages([]); return; }
    setError(null);
    try {
      const [objs, k, ch] = await Promise.all([getAdObjects(state.activeAdId), listBrandKits(), listComposerChannels()]);
      const imgs = objs.filter((o) => o.type === 'image');
      setImages(imgs);
      setKits(k);
      setChannels(ch);
      setSourceId((cur) => cur || (imgs[0]?.id ?? ''));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [state.activeAdId]);
  useEffect(() => { void load(); }, [load]);

  const toggleChannel = (id: string) =>
    setSelectedChannels((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addCallout = () => setData((d) => [...d, { label: '', value: '' }]);
  const patchCallout = (i: number, patch: Partial<DataCallout>) =>
    setData((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeCallout = (i: number) => setData((d) => d.filter((_, j) => j !== i));

  const canCompose = useMemo(
    () => !!sourceId && selectedChannels.size > 0 && (!!headline.trim() || data.some((c) => c.value.trim())) && !busy,
    [sourceId, selectedChannels, headline, data, busy],
  );

  const doCompose = useCallback(async () => {
    if (!sourceId || selectedChannels.size === 0) return;
    setBusy(true); setError(null); setResults([]); setAddedIds(new Set());
    try {
      const resp = await composeStill({
        imageRef: sourceId,
        adId: state.activeAdId ?? undefined,
        brandKitId,
        channels: Array.from(selectedChannels),
        copy: {
          headline: headline.trim() || undefined,
          sub: sub.trim() || undefined,
          cta: cta.trim() || undefined,
          data: data.filter((c) => c.value.trim() || c.label.trim()),
        },
      });
      setResults(resp.results);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [sourceId, selectedChannels, brandKitId, headline, sub, cta, data, state.activeAdId]);

  const addToAd = useCallback(async (id: string) => {
    if (!state.activeAdId) return;
    try { await addObject({ adId: state.activeAdId, type: 'image', id }); setAddedIds((s) => new Set(s).add(id)); }
    catch { /* keep grid resilient */ }
  }, [state.activeAdId]);

  if (!state.activeCampaignId || !state.activeAdId) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">
        Select a <span className="text-btnText font-[600]">Campaign</span> and an{' '}
        <span className="text-btnText font-[600]">Ad</span> in the Project bar above. The Composer
        builds a branded post from an image you’ve added to that Ad.
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">
        This Ad has no images yet. Generate one in <span className="text-btnText font-[600]">Images</span>{' '}
        (or capture a character), click <span className="text-btnText font-[600]">+ Add to ad</span>, then come back.
        {error && <div className="mt-[8px] text-red-400">{error}</div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[14px]">
        <div className="flex items-center gap-[8px]">
          <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center font-[700]">▣</span>
          <span className="text-[14px] font-[600] text-btnText">Compose a Still post</span>
        </div>

        {/* Source image picker — from the active Ad's images */}
        <div className="flex flex-col gap-[8px]">
          <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Source image</span>
          <div className="grid grid-cols-3 minCustom:grid-cols-5 gap-[8px]">
            {images.map((o) => {
              const u = srcUrl(o.record);
              const sel = o.id === sourceId;
              return (
                <button key={o.id} type="button" onClick={() => setSourceId(o.id)}
                  className={`rounded-[8px] overflow-hidden border-2 ${sel ? 'border-ai' : 'border-newBorder'} aspect-square`}
                  title={o.id}>
                  {u
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={u} alt={o.id} className="w-full h-full object-cover" />
                    : <span className="w-full h-full flex items-center justify-center text-[11px] text-textItemBlur">image</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Copy */}
        <div className="flex flex-col gap-[8px]">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Headline (e.g. Cash-flowing duplex)" className={`${inputCls} w-full`} />
          <div className="flex flex-wrap gap-[8px]">
            <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Sub / tagline (optional)" className={`${inputCls} flex-1 min-w-[180px]`} />
            <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="CTA (optional, e.g. Analyze it free)" className={`${inputCls} flex-1 min-w-[180px]`} />
          </div>
        </div>

        {/* Data callouts */}
        <div className="flex flex-col gap-[8px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Data callouts</span>
            <span className="text-[11px] text-textItemBlur">price · beds · cap rate… (overlaid, never AI-generated)</span>
            <button type="button" onClick={addCallout} className="ml-auto h-[28px] px-[10px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600]">+ Add</button>
          </div>
          {data.map((c, i) => (
            <div key={i} className="flex gap-[8px] items-center">
              <input value={c.label} onChange={(e) => patchCallout(i, { label: e.target.value })} placeholder="Label" className={`${inputCls} w-[120px]`} />
              <input value={c.value} onChange={(e) => patchCallout(i, { value: e.target.value })} placeholder="Value" className={`${inputCls} flex-1`} />
              <button type="button" onClick={() => removeCallout(i)} className="text-[12px] text-[#ff7eb6] hover:underline shrink-0">remove</button>
            </div>
          ))}
        </div>

        {/* Brand kit + channels */}
        <div className="flex flex-wrap gap-[14px] items-end">
          <label className="flex flex-col gap-[4px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Brand kit</span>
            <select value={brandKitId} onChange={(e) => setBrandKitId(e.target.value)} className={inputCls}>
              {kits.map((k) => (<option key={k.brand_kit_id} value={k.brand_kit_id}>{k.name}</option>))}
            </select>
          </label>
          <div className="flex flex-col gap-[4px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Channels</span>
            <div className="flex flex-wrap gap-[8px]">
              {channels.map((ch) => {
                const on = selectedChannels.has(ch.id);
                return (
                  <button key={ch.id} type="button" onClick={() => toggleChannel(ch.id)}
                    className={`h-[36px] px-[12px] rounded-[8px] border text-[12px] font-[600] ${on ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur'}`}
                    title={`${ch.w}×${ch.h}`}>
                    {ch.aspect}
                  </button>
                );
              })}
            </div>
          </div>
          <button type="button" disabled={!canCompose} onClick={doCompose}
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 disabled:cursor-not-allowed ml-auto flex items-center gap-[8px]">
            {busy ? <><Spinner /> Composing…</> : 'Compose'}
          </button>
        </div>

        {error && <div className="text-[12px] text-red-400">{error}</div>}
      </div>

      {/* Results — one branded still per channel */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 minCustom:grid-cols-3 gap-[12px]">
          {results.map((r) => (
            <div key={r.id} className="rounded-[8px] overflow-hidden border border-newBorder flex flex-col bg-newBgColorInner">
              {/* r.url is already a proxy-absolute /api/brain/assets path — use as-is. */}
              <a href={r.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={r.label} className="w-full h-auto" />
              </a>
              <div className="px-[8px] py-[6px] text-[11px] text-textItemBlur">{r.label} · {r.w}×{r.h}</div>
              <div className="flex">
                <a href={r.url} download className="flex-1 h-[30px] flex items-center justify-center text-[12px] font-[600] text-btnText border-t border-newBorder">Download</a>
                <button type="button" disabled={addedIds.has(r.id)} onClick={() => addToAd(r.id)}
                  className="flex-1 h-[30px] text-[12px] font-[600] text-white bg-btnPrimary disabled:opacity-50 border-t border-newBorder">
                  {addedIds.has(r.id) ? 'Added ✓' : '+ Add to ad'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
