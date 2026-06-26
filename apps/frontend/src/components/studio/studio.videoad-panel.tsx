'use client';

// Video-ad composer — channel × length cuts of an existing Ad clip (ffmpeg, $0).
// Pick a source clip from the active Ad, choose channels (aspect) + lengths, add
// supers copy → a matrix of trimmed, re-framed, supered MP4s. Magenta bg-ai = Cut;
// purple bg-btnPrimary = Add-to-ad. Postiz tokens. Backend: /compose/video-ad.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, addObject, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  listBrandKits, listComposerChannels, composeVideoAd, assetUrl,
  BrandKit, Channel, VideoAdCut, VideoAdSkip, VIDEO_AD_LENGTHS, DataCallout,
} from '@gitroom/frontend/components/studio/studio.composer-client';

const Spinner: FC<{ size?: number }> = ({ size = 18 }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
function clipUrlOf(rec: any): string | null { if (!rec) return null; if (rec.path) return assetUrl(rec.path); if (rec.cdnUrl) return rec.cdnUrl; return null; }
const inputCls = 'h-[40px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';

export const StudioVideoAdPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';

  const [clips, setClips] = useState<ResolvedObject[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [clipId, setClipId] = useState('');
  const [selChannels, setSelChannels] = useState<Set<string>>(new Set(['story']));
  const [selLengths, setSelLengths] = useState<Set<number>>(new Set([6, 15]));
  const [headline, setHeadline] = useState('');
  const [cta, setCta] = useState('');
  const [data, setData] = useState<DataCallout[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cuts, setCuts] = useState<VideoAdCut[]>([]);
  const [skipped, setSkipped] = useState<VideoAdSkip[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!state.activeAdId) { setClips([]); return; }
    setError(null);
    try {
      const [objs, k, ch] = await Promise.all([getAdObjects(state.activeAdId), listBrandKits(), listComposerChannels()]);
      const cl = objs.filter((o) => o.type === 'clip');
      setClips(cl); setKits(k); setChannels(ch);
      setClipId((cur) => cur || (cl[0]?.id ?? ''));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [state.activeAdId]);
  useEffect(() => { void load(); }, [load]);

  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) =>
    set((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n; });

  const addCallout = () => setData((d) => [...d, { label: '', value: '' }]);
  const patchCallout = (i: number, p: Partial<DataCallout>) => setData((d) => d.map((c, j) => (j === i ? { ...c, ...p } : c)));
  const removeCallout = (i: number) => setData((d) => d.filter((_, j) => j !== i));

  const canCut = useMemo(() => !!clipId && selChannels.size > 0 && selLengths.size > 0 && !busy, [clipId, selChannels, selLengths, busy]);

  const doCut = useCallback(async () => {
    if (!canCut) return;
    setBusy(true); setError(null); setCuts([]); setSkipped([]); setAddedIds(new Set());
    try {
      const resp = await composeVideoAd({
        adId: state.activeAdId ?? undefined, clipRef: clipId, brandKitId,
        channels: Array.from(selChannels), lengths: Array.from(selLengths),
        copy: { headline: headline.trim() || undefined, cta: cta.trim() || undefined, data: data.filter((c) => c.value.trim() || c.label.trim()) },
      });
      setCuts(resp.cuts); setSkipped(resp.skipped);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [canCut, clipId, selChannels, selLengths, headline, cta, data, brandKitId, state.activeAdId]);

  const addToAd = useCallback(async (id: string) => {
    if (!state.activeAdId) return;
    try { await addObject({ adId: state.activeAdId, type: 'clip', id }); setAddedIds((s) => new Set(s).add(id)); } catch { /* */ }
  }, [state.activeAdId]);

  if (!state.activeCampaignId || !state.activeAdId)
    return <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">Select a Campaign + Ad in the Project bar first.</div>;
  if (clips.length === 0)
    return <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">This Ad has no clips yet. Compose a video in the <span className="text-btnText font-[600]">Video</span> tab and Add-to-ad, then come back.</div>;

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px]">
          <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center font-[700]">✂</span>
          <span className="text-[14px] font-[600] text-btnText">Cut a Video ad (channel × length)</span>
          <select value={brandKitId} onChange={(e) => dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: e.target.value })} className={`${inputCls} ml-auto`}>
            {kits.map((k) => (<option key={k.brand_kit_id} value={k.brand_kit_id}>{k.name}</option>))}
          </select>
        </div>

        {/* Source clip */}
        <div className="flex flex-col gap-[6px]">
          <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Source clip</span>
          <div className="grid grid-cols-3 minCustom:grid-cols-5 gap-[8px]">
            {clips.map((o) => {
              const u = clipUrlOf(o.record); const sel = o.id === clipId;
              return (
                <button key={o.id} type="button" onClick={() => setClipId(o.id)} className={`rounded-[8px] overflow-hidden border-2 ${sel ? 'border-ai' : 'border-newBorder'} aspect-video bg-black`} title={o.id}>
                  {u ? <video src={u} muted className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center text-[11px] text-textItemBlur">clip</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Channels + lengths */}
        <div className="flex flex-wrap gap-[16px]">
          <div className="flex flex-col gap-[4px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Channels</span>
            <div className="flex flex-wrap gap-[8px]">
              {channels.map((ch) => { const on = selChannels.has(ch.id); return (
                <button key={ch.id} type="button" onClick={() => toggle(setSelChannels, ch.id)} className={`h-[34px] px-[12px] rounded-[8px] border text-[12px] font-[600] ${on ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur'}`}>{ch.aspect}</button>
              ); })}
            </div>
          </div>
          <div className="flex flex-col gap-[4px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Lengths</span>
            <div className="flex flex-wrap gap-[8px]">
              {VIDEO_AD_LENGTHS.map((len) => { const on = selLengths.has(len); return (
                <button key={len} type="button" onClick={() => toggle(setSelLengths, len)} className={`h-[34px] px-[12px] rounded-[8px] border text-[12px] font-[600] ${on ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur'}`}>{len}s</button>
              ); })}
            </div>
          </div>
        </div>

        {/* Supers copy */}
        <div className="flex gap-[8px]">
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="Supers headline" className={`${inputCls} flex-1`} />
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="CTA (optional)" className={`${inputCls} w-[160px]`} />
        </div>
        <div className="flex flex-col gap-[6px]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Data callouts</span>
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

        <button type="button" disabled={!canCut} onClick={doCut}
          className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 self-end flex items-center gap-[8px]">
          {busy ? <><Spinner /> Cutting…</> : `Cut ${selChannels.size * selLengths.size} variant${selChannels.size * selLengths.size === 1 ? '' : 's'}`}
        </button>
        {error && <div className="text-[12px] text-red-400">{error}</div>}
        {skipped.length > 0 && <div className="text-[12px] text-textItemBlur">Skipped (longer than source): {skipped.map((s) => `${s.channelId} ${s.length}s`).join(', ')}</div>}
      </div>

      {cuts.length > 0 && (
        <div className="grid grid-cols-2 minCustom:grid-cols-3 gap-[12px]">
          {cuts.map((c) => (
            <div key={c.id} className="rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner flex flex-col">
              <video src={c.url} controls className="w-full bg-black" />
              <div className="px-[8px] py-[4px] text-[11px] text-textItemBlur">{c.channelId} · {c.length}s · {c.w}×{c.h}</div>
              <div className="flex">
                <a href={c.url} download className="flex-1 h-[28px] flex items-center justify-center text-[12px] font-[600] text-btnText border-t border-newBorder">Download</a>
                <button type="button" disabled={addedIds.has(c.id)} onClick={() => addToAd(c.id)} className="flex-1 h-[28px] text-[12px] font-[600] text-white bg-btnPrimary disabled:opacity-50 border-t border-newBorder">
                  {addedIds.has(c.id) ? 'Added ✓' : '+ Add to ad'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
