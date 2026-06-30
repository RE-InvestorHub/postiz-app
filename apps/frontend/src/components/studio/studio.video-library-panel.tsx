'use client';

// Video tab — brand-scoped Video LIBRARY, laid out like the Images library: a left sidebar list
// (clips/shorts + keyframe stills, with a type filter) + a right MEDIA-AWARE canvas — a video
// player for a clip, a still preview for a keyframe. Mirrors studio.images-panel.tsx. Clips come
// from the pipeline; keyframes are images marked via the Images→Video bridge. Postiz tokens only.

import { FC, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  listVideoLibrary, deleteBrandClips, removeKeyframe,
  BrandClip, BrandKeyframe,
} from '@gitroom/frontend/components/studio/studio.video-client';

type LibItem = BrandClip | BrandKeyframe;
type Filter = 'all' | 'clips' | 'keyframes';

const card = 'rounded-[8px] border border-newBorder bg-newBgColor p-[16px]';

export const StudioVideoLibraryPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const brandKitId = state.composerBrandKitId || 'default';

  const [clips, setClips] = useState<BrandClip[]>([]);
  const [keyframes, setKeyframes] = useState<BrandKeyframe[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  // Bulk select-and-remove.
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Right-click numbering: the ordered sequence lives in the store (state.videoKeyframes); a
  // keyframe's position = its index+1. Right-click a keyframe tile → set/clear its position.
  const [ctx, setCtx] = useState<{ item: BrandKeyframe; x: number; y: number } | null>(null);
  const seq = state.videoKeyframes;
  const posOf = (id: string) => { const i = seq.findIndex((k) => k.id === id); return i < 0 ? null : i + 1; };
  const setPosition = (item: BrandKeyframe, n: number) => {
    const without = seq.filter((k) => k.id !== item.id);
    const at = Math.max(1, Math.min(n, without.length + 1));
    const next = [
      ...without.slice(0, at - 1),
      { id: item.id, url: item.url, label: item.prompt || undefined },
      ...without.slice(at - 1),
    ];
    dispatch({ type: 'SET_VIDEO_KEYFRAMES', keyframes: next });
  };
  const removeFromSeq = (id: string) => dispatch({ type: 'REMOVE_VIDEO_KEYFRAME', id });

  const items: LibItem[] = [
    ...(filter === 'keyframes' ? [] : clips),
    ...(filter === 'clips' ? [] : keyframes),
  ];
  const selected = items.find((i) => i.id === selectedId) || null;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const lib = await listVideoLibrary(brandKitId);
      setClips(lib.clips); setKeyframes(lib.keyframes);
      const all = [...lib.clips, ...lib.keyframes];
      setSelectedId((prev) => (prev && all.some((i) => i.id === prev) ? prev : (all[0]?.id ?? null)));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setLoading(false); }
  }, [brandKitId]);

  useEffect(() => { void load(); }, [load]);
  // Scene Director on Video / gap-fill renders fire this when a new asset lands.
  useEffect(() => {
    const onRefresh = () => void load();
    if (typeof window !== 'undefined') window.addEventListener('reinvestorhub:video-refresh', onRefresh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('reinvestorhub:video-refresh', onRefresh); };
  }, [load]);

  const addToAd = async () => {
    if (!state.activeAdId || !selected || selected.kind !== 'clip') return;
    try { await addObject({ adId: state.activeAdId, type: 'clip', id: selected.id }); setAdded((s) => new Set(s).add(selected.id)); }
    catch { /* keep resilient */ }
  };

  const doDelete = async () => {
    if (!selected) return;
    try {
      if (selected.kind === 'clip') {
        await deleteBrandClips([selected.id]);
        toaster.show('Clip deleted from the brand.', 'success');
      } else {
        await removeKeyframe(selected.id);
        dispatch({ type: 'REMOVE_VIDEO_KEYFRAME', id: selected.id });
        // The image keeps living in the Images library — refresh it so its keyframe chip clears.
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh'));
        toaster.show('Removed from keyframes (the image itself is kept).', 'success');
      }
      setConfirmDel(false);
      await load();
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  };

  // --- bulk select-and-remove (clips → delete; keyframes → un-mark) ---
  const exitSelect = () => { setSelectMode(false); setChecked(new Set()); setConfirmBulk(false); };
  const toggleCheck = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setChecked(new Set(items.map((i) => i.id)));
  const doBulk = async () => {
    if (!checked.size) return;
    setBulkBusy(true); setError(null);
    try {
      const clipIds = clips.filter((c) => checked.has(c.id)).map((c) => c.id);
      const kfIds = keyframes.filter((k) => checked.has(k.id)).map((k) => k.id);
      if (clipIds.length) await deleteBrandClips(clipIds);
      for (const id of kfIds) { await removeKeyframe(id); dispatch({ type: 'REMOVE_VIDEO_KEYFRAME', id }); }
      // Un-marked keyframes stay in the Images library — refresh it so their keyframe chips clear.
      if (kfIds.length && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh'));
      toaster.show(`${checked.size} item${checked.size === 1 ? '' : 's'} removed from the Video library.`, 'success');
      exitSelect();
      await load();
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBulkBusy(false); }
  };

  return (
    <div className="flex flex-col md:flex-row gap-[14px]">
      {/* Left sidebar — the brand's video library */}
      <div className={card + ' md:w-[260px] shrink-0 flex flex-col gap-[10px]'}>
        <div className="flex items-center gap-[8px] flex-wrap">
          <span className="text-[14px] font-[600] text-btnText flex-1">Video library</span>
          <span className="text-[11px] text-textItemBlur">{loading ? '…' : items.length}</span>
          {items.length > 0 && !selectMode && (
            <button type="button" onClick={() => setSelectMode(true)} className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur hover:text-btnText">Select</button>
          )}
        </div>
        {/* Type filter: All / Keyframes / Clips */}
        <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden self-start">
          {([['all', 'All'], ['keyframes', `Keyframes${keyframes.length ? ` ${keyframes.length}` : ''}`], ['clips', `Clips${clips.length ? ` ${clips.length}` : ''}`]] as [Filter, string][]).map(([f, lbl]) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={'h-[28px] px-[10px] text-[11px] font-[600] ' + (filter === f ? 'bg-btnPrimary text-btnText' : 'text-textItemBlur hover:text-btnText')}>{lbl}</button>
          ))}
        </span>
        {selectMode && (
          <div className="flex items-center gap-[6px] flex-wrap text-[11px]">
            <span className="text-textItemBlur">{checked.size} selected</span>
            <button type="button" onClick={selectAll} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">All</button>
            <button type="button" onClick={() => setChecked(new Set())} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">None</button>
            <button type="button" onClick={exitSelect} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">Done</button>
            {confirmBulk ? (
              <>
                <button type="button" disabled={!checked.size || bulkBusy} onClick={doBulk} className="px-[8px] h-[24px] rounded-[5px] bg-[#ff7eb6] text-[#3a0d23] font-[700] disabled:opacity-50">{bulkBusy ? '…' : `Remove ${checked.size}`}</button>
                <button type="button" onClick={() => setConfirmBulk(false)} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">Cancel</button>
              </>
            ) : (
              <button type="button" disabled={!checked.size} onClick={() => setConfirmBulk(true)} className="px-[8px] h-[24px] rounded-[5px] border border-[#ff7eb6]/40 text-[#ff7eb6] font-[600] disabled:opacity-40 hover:bg-[#ff7eb6]/10">Remove ({checked.size})</button>
            )}
          </div>
        )}
        {error && <span className="text-[12px] text-red-400">{error}</span>}
        {!loading && items.length === 0 ? (
          <div className="text-[12px] text-textItemBlur py-[14px]">
            {filter === 'keyframes'
              ? 'No keyframes yet. Send images from the Images tab (Select → Send to Video).'
              : filter === 'clips'
              ? 'No clips yet. Generate a video below or with the AI Agent.'
              : 'Nothing here yet. Generate clips below, or send keyframes from the Images tab.'}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-[8px] overflow-y-auto max-h-[60vh] pr-[2px]">
            {items.map((it) => {
              const isChecked = checked.has(it.id);
              const ring = selectMode
                ? (isChecked ? 'border-[#ff7eb6] ring-1 ring-[#ff7eb6]' : 'border-newBorder hover:border-btnText/40')
                : (it.id === selectedId ? 'border-ai ring-1 ring-ai' : 'border-newBorder hover:border-btnText/40');
              const pos = it.kind === 'keyframe' ? posOf(it.id) : null;
              return (
                <button key={it.id} type="button" onClick={() => (selectMode ? toggleCheck(it.id) : setSelectedId(it.id))}
                  onContextMenu={it.kind === 'keyframe' && !selectMode ? (e) => { e.preventDefault(); setCtx({ item: it as BrandKeyframe, x: e.clientX, y: e.clientY }); } : undefined}
                  title={it.kind === 'keyframe' && !selectMode ? 'Right-click to set its position in the sequence' : undefined}
                  className={'relative aspect-square rounded-[6px] overflow-hidden border bg-black ' + ring}>
                  {it.kind === 'clip' ? (
                    // Muted inline preview — the thumbnail for a clip tile.
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={it.url} muted preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.url} alt={it.prompt || it.id} className="w-full h-full object-cover" />
                  )}
                  {/* Sequence position badge — the keyframe's place in the next render's order. */}
                  {pos != null && (
                    <span className="absolute top-[3px] left-[3px] h-[20px] min-w-[20px] px-[4px] rounded-full bg-ai text-white text-[11px] font-[800] leading-[20px] text-center shadow">{pos}</span>
                  )}
                  {/* Type chip — clip vs keyframe, instantly identifiable. */}
                  <span className={'absolute bottom-[3px] left-[3px] right-[3px] truncate rounded-[4px] text-white text-[9px] font-[700] leading-none px-[4px] py-[3px] text-center '
                    + (it.kind === 'clip' ? 'bg-btnPrimary/85' : 'bg-ai/85')}>{it.kind === 'clip' ? '▶ clip' : '▦ keyframe'}</span>
                  {selectMode && (
                    <span className={'absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-[4px] border flex items-center justify-center text-[11px] leading-none ' + (isChecked ? 'bg-[#ff7eb6] border-[#ff7eb6] text-[#3a0d23]' : 'bg-black/45 border-white/50 text-transparent')}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right — media-aware canvas for the selected item */}
      <div className={card + ' flex-1 min-w-0 flex flex-col gap-[12px]'}>
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-[13px] text-textItemBlur py-[60px] text-center">
            Select a clip or keyframe from the library to view it here.
          </div>
        ) : (
          <>
            <div className="rounded-[8px] border border-newBorder overflow-hidden flex items-center justify-center min-h-[300px] max-h-[58vh] bg-black">
              {selected.kind === 'clip' ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={selected.url} controls playsInline className="max-w-full max-h-[58vh] object-contain" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selected.url} alt={selected.prompt || selected.id} className="max-w-full max-h-[58vh] object-contain" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-[8px]">
              <a href={selected.url} download className="h-[36px] px-[14px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText flex items-center hover:bg-boxHover">↓ Download</a>
              {selected.kind === 'clip' ? (
                <button type="button" disabled={!state.activeAdId || added.has(selected.id)} onClick={addToAd}
                  title={state.activeAdId ? 'Add this clip to the active ad' : 'Select a campaign + ad first'}
                  className="h-[36px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">
                  {added.has(selected.id) ? 'Added ✓' : '+ Add to ad'}
                </button>
              ) : posOf(selected.id) != null ? (
                <span className="h-[36px] px-[14px] rounded-[8px] bg-ai/15 text-ai text-[12px] font-[700] flex items-center gap-[6px]"
                  title="Right-click the tile in the library to change its position">
                  <span className="h-[18px] min-w-[18px] px-[3px] rounded-full bg-ai text-white text-[10px] font-[800] leading-[18px] text-center">{posOf(selected.id)}</span>
                  in sequence
                </span>
              ) : (
                <button type="button" onClick={() => setPosition(selected as BrandKeyframe, seq.length + 1)}
                  title="Add this keyframe to the end of the sequence (or right-click the tile to set an exact position)"
                  className="h-[36px] px-[14px] rounded-[8px] bg-ai text-white text-[12px] font-[600]">
                  ▦ Add to sequence
                </button>
              )}
              <a href={selected.url} target="_blank" rel="noreferrer" className="h-[36px] px-[14px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur flex items-center hover:text-btnText">Open ↗</a>
              <span className="ml-auto" />
              {confirmDel ? (
                <span className="flex items-center gap-[8px]">
                  <span className="text-[12px] text-[#ff7eb6]">{selected.kind === 'clip' ? 'Delete this clip from the brand?' : 'Remove this keyframe from the Video library?'}</span>
                  <button type="button" onClick={doDelete} className="h-[36px] px-[14px] rounded-[8px] bg-[#ff7eb6] text-[#3a0d23] text-[12px] font-[700]">{selected.kind === 'clip' ? 'Delete' : 'Remove'}</button>
                  <button type="button" onClick={() => setConfirmDel(false)} className="h-[36px] px-[12px] rounded-[8px] border border-newBorder text-textItemBlur text-[12px] hover:text-btnText">Cancel</button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDel(true)}
                  className="h-[36px] px-[14px] rounded-[8px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[12px] font-[600] hover:bg-[#ff7eb6]/10">{selected.kind === 'clip' ? 'Delete' : 'Remove'}</button>
              )}
            </div>
            {/* Metadata */}
            <div className="text-[11px] text-textItemBlur flex flex-col gap-[3px]">
              <span className="text-[12px] font-[700] text-ai">{selected.kind === 'clip' ? '▶ Clip / short' : '▦ Keyframe still'}</span>
              {selected.prompt && <span className="text-btnText/80 line-clamp-2"><b className="text-textItemBlur font-[600]">Prompt:</b> {selected.prompt}</span>}
              <span className="flex flex-wrap gap-x-[14px] gap-y-[2px]">
                {selected.model && <span>Model: {selected.model}</span>}
                {selected.stage && <span>Stage: {selected.stage}</span>}
                {selected.provenance && <span>Source: {selected.provenance}</span>}
                {selected.createdAt && <span>{new Date(selected.createdAt).toLocaleString()}</span>}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right-click numbering popover — set/clear a keyframe's position in the sequence. */}
      {ctx && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000]" onClick={() => setCtx(null)} onContextMenu={(e) => { e.preventDefault(); setCtx(null); }}>
          <div className="absolute w-[210px] rounded-[10px] border border-newBorder bg-newBgColor p-[10px] flex flex-col gap-[8px] shadow-xl"
            style={{ left: Math.min(ctx.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 222), top: Math.min(ctx.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 160) }}
            onClick={(e) => e.stopPropagation()}>
            <span className="text-[12px] font-[700] text-btnText">Sequence position</span>
            <span className="text-[10px] text-textItemBlur leading-[1.3] line-clamp-1">{ctx.item.prompt || ctx.item.id}</span>
            <div className="flex flex-wrap gap-[5px]">
              {Array.from({ length: seq.filter((k) => k.id !== ctx.item.id).length + 1 }, (_, i) => i + 1).map((n) => {
                const current = posOf(ctx.item.id) === n;
                return (
                  <button key={n} type="button" onClick={() => { setPosition(ctx.item, n); setCtx(null); }}
                    className={'h-[28px] w-[28px] rounded-[6px] text-[12px] font-[700] border ' + (current ? 'bg-ai text-white border-ai' : 'border-newBorder text-btnText hover:bg-boxHover')}>{n}</button>
                );
              })}
            </div>
            {posOf(ctx.item.id) != null && (
              <button type="button" onClick={() => { removeFromSeq(ctx.item.id); setCtx(null); }}
                className="h-[28px] rounded-[6px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[11px] font-[600] hover:bg-[#ff7eb6]/10">Remove from sequence</button>
            )}
          </div>
        </div>, document.body)}
    </div>
  );
};

export default StudioVideoLibraryPanel;
