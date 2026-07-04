'use client';

// Images tab — a brand-scoped image LIBRARY laid out like the Brand tab: a left sidebar
// list of the brand's images + a right "canvas" showing the selected image with its actions
// (download / + Add to ad / delete). A top bar carries the Model · Aspect · Resolution
// settings (used by the AI Agent) + an Upload button. Generation lives in the AI Agent for
// now. Postiz tokens only.

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { listBrandImages, deleteBrandImage, deleteBrandImages, listChannelPresets, reshapeImage, tagImageForAvatar, editImage, removeImageText, BrandImage, ChannelPreset } from '@gitroom/frontend/components/studio/studio.image-client';
import { ImageCropOverlay, CropToolbar, CropRect, CropTool } from '@gitroom/frontend/components/studio/studio.image-crop-overlay';
import { addKeyframes, removeKeyframe } from '@gitroom/frontend/components/studio/studio.video-client';
import { StudioSceneDirector } from '@gitroom/frontend/components/studio/studio.scene-director';
import { CanvasSoulButton } from '@gitroom/frontend/components/studio/studio.soul-control';
import { captureComponent, COMPONENT_KINDS } from '@gitroom/frontend/components/studio/studio.director-client';

type ModelOpt = { value: string; label: string; credits: string };
interface StudioImagesPanelProps {
  caps: Record<string, { handler: (args?: any) => unknown }>;
  models: ModelOpt[];
}

// Subtle checkerboard so transparent PNGs read on the canvas.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,rgba(255,255,255,.04) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.04) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.04) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.04) 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
};

export const StudioImagesPanel: FC<StudioImagesPanelProps> = ({ caps, models }) => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const brandKitId = state.composerBrandKitId || 'default';
  const brandName = brandKitId === 'default' ? 'Re:InvestorHub (default)' : 'this brand';
  const [images, setImages] = useState<BrandImage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  // Bulk select-and-delete.
  const [selectMode, setSelectMode] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  // Capture as reusable Director component.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureKind, setCaptureKind] = useState('character');
  const [captureName, setCaptureName] = useState('');
  const [capturing, setCapturing] = useState(false);
  // A generation (Scene Director / agent) is in flight → show a spinner placeholder.
  const [generating, setGenerating] = useState(false);
  // Channel reshape (canvas).
  const [channels, setChannels] = useState<ChannelPreset[]>([]);
  const [reshapeChannel, setReshapeChannel] = useState('');
  const [reshapeFit, setReshapeFit] = useState<'crop' | 'pad'>('crop');
  const [reshaping, setReshaping] = useState(false);
  const [channelFilter, setChannelFilter] = useState('all'); // library filter by channel (B3)
  const [exportingAll, setExportingAll] = useState(false);
  // Manual crop / zoom marquee on the canvas (free, non-destructive — rides /images/edit ops).
  // cropTool = which on-canvas tool is active (null = off); its icons live in a bottom-left toolbar.
  const [cropTool, setCropTool] = useState<CropTool | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [removingText, setRemovingText] = useState(false);

  const selected = images.find((i) => i.id === selectedId) || null;
  // Share the selection with the store so the AI Agent can see/act on the current image.
  useEffect(() => { dispatch({ type: 'SET_SELECTED_IMAGE', id: selectedId }); }, [selectedId, dispatch]);
  // Leave crop mode whenever the selected image changes (never crop a stale target).
  useEffect(() => { setCropTool(null); }, [selectedId]);

  // Apply the marquee. 'crop' = a tighter frame; 'zoom' = crop then upscale the crop back toward a
  // hi-res long edge so a closer face stays sharp. Both ride the FREE, lineage-tracked /images/edit
  // ops; the new variant is selected via the images-refresh event (pendingSelectRef).
  const onCropApply = useCallback(async (rect: CropRect, mode: CropTool) => {
    if (!selected || cropBusy) return;
    const box = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    setCropBusy(true);
    try {
      let finalId: string; let msg: string;
      if (mode === 'erase') {
        // Heal: clone a clean neighbouring strip over the boxed region (removes stray text/marks).
        finalId = (await editImage(selected.id, 'heal', box)).id;
        msg = 'Erased — new variant added. Original kept.';
      } else {
        const cropped = await editImage(selected.id, 'crop', box);
        finalId = cropped.id;
        if (mode === 'zoom') {
          const longEdge = Math.max(rect.width, rect.height);
          const percent = Math.min(400, Math.max(100, Math.round((1536 / longEdge) * 100))); // toward ~1536px, capped by the op
          if (percent > 100) finalId = (await editImage(cropped.id, 'scale', { percent })).id;
        }
        msg = mode === 'zoom' ? 'Zoomed in — new variant added. Original kept.' : 'Cropped — new variant added. Original kept.';
      }
      setCropTool(null);
      toaster.show(msg, 'success');
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh', { detail: { selectImageId: finalId } }));
    } catch (e) { toaster.show((e as Error)?.message ?? 'Edit failed', 'warning'); }
    finally { setCropBusy(false); }
  }, [selected, cropBusy, toaster]);

  // Remove hallucinated on-image text (fake captions/watermarks) — pixel-safe declutter; keeps the
  // subject untouched. New variant when text was healed; nudges to install OCR if it's missing.
  const onRemoveText = useCallback(async () => {
    if (!selected || removingText) return;
    setRemovingText(true);
    try {
      const r = await removeImageText(selected.id);
      if (!r.ocr) toaster.show('Text removal needs OCR — run: sudo apt install -y tesseract-ocr', 'warning');
      else if (!r.healed) toaster.show('No removable text found.', 'success');
      else {
        toaster.show(`Removed ${r.healed} text region${r.healed > 1 ? 's' : ''}. Original kept.`, 'success');
        if (typeof window !== 'undefined' && r.id) window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh', { detail: { selectImageId: r.id } }));
      }
    } catch (e) { toaster.show((e as Error)?.message ?? 'Remove text failed', 'warning'); }
    finally { setRemovingText(false); }
  }, [selected, removingText, toaster]);
  // After an agent edit, the new variant id should become the canvas selection. We carry it on a
  // ref set by the refresh event (below) and apply it once that variant lands in the library —
  // local `selectedId` stays the single source of truth (no store->local effect ping-pong).
  const pendingSelectRef = useRef<string | null>(null);
  useEffect(() => {
    const want = pendingSelectRef.current;
    if (want && images.some((i) => i.id === want)) { pendingSelectRef.current = null; setSelectedId(want); }
  }, [images]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const list = await listBrandImages(brandKitId);
      setImages(list);
      // Keep selection if still present, else select the newest.
      setSelectedId((prev) => (prev && list.some((i) => i.id === prev) ? prev : (list[0]?.id ?? null)));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setLoading(false); }
  }, [brandKitId]);

  useEffect(() => { void load(); }, [load]);
  // Pick up agent/inline generations (they push to state.results) without a manual refresh.
  const genCount = state.results.filter((r) => r.tab === 'images').length;
  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [genCount]);
  // Scene Director / agent renders fire this event when a new shot lands in the library.
  useEffect(() => {
    const onRefresh = (e: Event) => {
      // An agent edit passes the new variant id → select it once it lands (see pendingSelectRef effect).
      const id = (e as CustomEvent).detail?.selectImageId;
      if (id) pendingSelectRef.current = String(id);
      void load();
    };
    const onGenerating = (e: Event) => setGenerating(!!(e as CustomEvent).detail?.active);
    if (typeof window !== 'undefined') {
      window.addEventListener('reinvestorhub:images-refresh', onRefresh);
      window.addEventListener('reinvestorhub:images-generating', onGenerating as EventListener);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('reinvestorhub:images-refresh', onRefresh);
        window.removeEventListener('reinvestorhub:images-generating', onGenerating as EventListener);
      }
    };
  }, [load]);

  // Keep the selected model valid for the Images tab.
  useEffect(() => {
    if (models.length && !models.some((m) => m.value === state.model)) {
      caps['studio.selectModel']?.handler({ model: models[0].value });
    }
  }, [models, state.model, caps]);

  // Channel presets for the canvas Reshape control.
  useEffect(() => { listChannelPresets().then((c) => { setChannels(c); setReshapeChannel((prev) => prev || c[0]?.id || ''); }).catch(() => {}); }, []);

  const onReshape = async () => {
    if (!selected || !reshapeChannel || reshaping) return;
    setReshaping(true); setError(null);
    try {
      const variant = await reshapeImage(selected.id, reshapeChannel, reshapeFit);
      await load();
      setSelectedId(variant.id); // jump to the new channel-sized variant
      toaster.show(`Reshaped to ${variant.channelLabel} (${variant.w}×${variant.h}). Original kept.`, 'success');
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setReshaping(false); }
  };

  const onCaptureComponent = async () => {
    if (!selected || !captureName.trim() || capturing) return;
    setCapturing(true); setError(null);
    try {
      const c = await captureComponent(selected.id, captureKind, captureName.trim(), brandKitId);
      setCaptureOpen(false); setCaptureName('');
      // Let the Scene Director refresh its dropdowns so the new component is reusable now.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:director-refresh'));
      toaster.show(`Saved "${c.name}" as a reusable ${c.type} — pick it in the Scene Director.`, 'success');
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setCapturing(false); }
  };

  // A4 — Tweak: reopen the agent seeded with this shot's stored spec to adjust + re-render a variant.
  const onTweak = () => {
    if (!selected?.spec) return;
    const s = selected.spec as Record<string, string>;
    const summary = Object.entries(s)
      .filter(([k, v]) => v && !['renderMode', 'aspectRatio', 'brandKitId', 'anchorId'].includes(k))
      .map(([k, v]) => `- ${k}: ${v}`).join('\n');
    const seed = `Let's tweak this existing ad shot. Its current spec:\n${summary}\nRender mode: ${selected.renderMode || 'layered'}. ` +
      `Tell me what to change — keep everything else exactly — then re-render it as a new variant.`;
    dispatch({ type: 'OPEN_FLOATING_AGENT', kind: 'shot', brandKitId, seed });
  };

  // B2 — Export all social channels: reshape the selected image to a full set (non-destructive).
  const onExportAll = async () => {
    if (!selected || exportingAll) return;
    setExportingAll(true); setError(null);
    try {
      const social = channels.filter((c) => ['ig-square', 'ig-portrait', 'ig-story', 'reels', 'fb-ad', 'yt-thumb', 'x-header'].includes(c.id));
      for (const c of social) { await reshapeImage(selected.id, c.id, reshapeFit); }
      await load();
      toaster.show(`Exported ${social.length} channel sizes (${reshapeFit}). Original kept.`, 'success');
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setExportingAll(false); }
  };

  // B3 — library channel filter.
  const channelsInLib = Array.from(new Set(images.map((i) => i.channel).filter(Boolean))) as string[];
  const visibleImages = channelFilter === 'all' ? images : images.filter((i) => i.channel === channelFilter);

  const onUploaded = (_a: UploadedAsset) => { void load(); };
  const addToAd = async () => {
    if (!state.activeAdId || !selected) return;
    try { await addObject({ adId: state.activeAdId, type: 'image', id: selected.id }); setAdded((s) => new Set(s).add(selected.id)); }
    catch { /* keep resilient */ }
  };
  // Images→Avatar bridge: tag this image so it surfaces in the avatar canvas portrait picker.
  const applyAvatarTag = async (use: boolean, name?: string) => {
    if (!selected) return;
    const nm = use ? (name ?? selected.avatarName ?? (selected.prompt ? selected.prompt.slice(0, 40) : '')) : null;
    try {
      await tagImageForAvatar(selected.id, use, nm ?? undefined);
      setImages((prev) => prev.map((i) => (i.id === selected.id ? { ...i, avatarUse: use, avatarName: nm } : i)));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  };
  const doDelete = async () => {
    if (!selected) return;
    try {
      await deleteBrandImage(selected.id);
      setConfirmDel(false);
      setImages((prev) => prev.filter((i) => i.id !== selected.id));
      setSelectedId((prev) => { const rest = images.filter((i) => i.id !== prev); return rest[0]?.id ?? null; });
      toaster.show('Image deleted from the brand.', 'success');
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  };

  // --- bulk select-and-delete ---
  const exitSelect = () => { setSelectMode(false); setChecked(new Set()); setConfirmBulk(false); };
  const toggleCheck = (id: string) => setChecked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectAll = () => setChecked(new Set(images.map((i) => i.id)));
  const doBulkDelete = async () => {
    if (!checked.size) return;
    setBulkBusy(true); setError(null);
    try {
      const ids = [...checked];
      await deleteBrandImages(ids);
      setImages((prev) => prev.filter((i) => !checked.has(i.id)));
      setSelectedId((prev) => (prev && checked.has(prev) ? null : prev));
      toaster.show(`${ids.length} image${ids.length === 1 ? '' : 's'} deleted from the brand.`, 'success');
      exitSelect();
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBulkBusy(false); }
  };

  // Keyframe is a flag on the SAME asset — a marked image shows in both the Images library and the
  // Video Library's Keyframes pool. Refresh both after a toggle so the asset's dual presence stays in sync.
  const fireVideoRefresh = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh')); };

  // Canvas promote/demote — toggle the selected image's keyframe flag (immediate, no separate Save).
  const [kfBusy, setKfBusy] = useState(false);
  const doToggleKeyframe = async () => {
    if (!selected || kfBusy) return;
    setKfBusy(true); setError(null);
    try {
      if (selected.keyframe) { await removeKeyframe(selected.id); toaster.show('Removed from keyframes — the image is kept.', 'success'); }
      else { await addKeyframes([selected.id]); toaster.show('Marked as a keyframe — find it in the Video tab.', 'success'); }
      await load();          // re-fetch so the toggle label + chip reflect the new state
      fireVideoRefresh();    // the Video Library's Keyframes pool updates too
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setKfBusy(false); }
  };

  // Bulk promote/demote on the checked images — mark IN PLACE (no forced tab-jump) + a toast.
  const doBulkKeyframe = async (mark: boolean) => {
    if (!checked.size) return;
    setBulkBusy(true); setError(null);
    try {
      const ids = images.filter((i) => checked.has(i.id)).map((i) => i.id);
      if (mark) await addKeyframes(ids);
      else { for (const id of ids) await removeKeyframe(id); }
      exitSelect();
      await load();
      fireVideoRefresh();
      toaster.show(mark
        ? `Marked ${ids.length} as keyframe${ids.length === 1 ? '' : 's'} — find them in the Video tab.`
        : `Removed ${ids.length} from keyframes — the image${ids.length === 1 ? ' is' : 's are'} kept.`, 'success');
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setBulkBusy(false); }
  };

  const card = 'rounded-[8px] border border-newBorder bg-newBgColor p-[16px]';
  const selectCls = 'h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText';

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Scene Director — build an ad shot object-by-object, then develop + render with AI. */}
      <StudioSceneDirector brandKitId={brandKitId} />

      {/* Top bar: generation SETTINGS (used by the AI Agent) + Upload */}
      <div className="flex flex-wrap items-center gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[10px]">
        <select value={state.model} onChange={(e) => caps['studio.selectModel']?.handler({ model: e.target.value })} className={selectCls} title="Image model">
          {models.map((m) => (<option key={m.value} value={m.value}>{m.label} ({m.credits})</option>))}
        </select>
        {/* Aspect ratio + resolution now live in the Scene Director (single home for both). */}
        <span className="text-[11px] text-textItemBlur hidden lg:inline">Model the AI Agent generates with. Aspect &amp; resolution are set in the Scene Director.</span>
        <button type="button" onClick={() => setUploadOpen(true)}
          className="ml-auto h-[36px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] hover:opacity-90">⬆ Upload</button>
      </div>

      <div className="flex flex-col md:flex-row gap-[14px]">
        {/* Left sidebar — the brand's image library */}
        <div className={card + ' md:w-[260px] shrink-0 flex flex-col gap-[10px]'}>
          <div className="flex items-center gap-[8px] flex-wrap">
            <span className="text-[14px] font-[600] text-btnText flex-1">Image library</span>
            <span className="text-[11px] text-textItemBlur">{loading ? '…' : visibleImages.length}</span>
            {images.length > 0 && !selectMode && (
              <button type="button" onClick={() => setSelectMode(true)} className="h-[26px] px-[8px] rounded-[6px] border border-newBorder text-[11px] text-textItemBlur hover:text-btnText">Select</button>
            )}
          </div>
          {channelsInLib.length > 0 && (
            <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} title="Filter by channel"
              className="h-[30px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[11px] text-btnText">
              <option value="all">All images</option>
              {channelsInLib.map((ch) => {
                const lbl = images.find((i) => i.channel === ch)?.channelLabel || ch;
                return <option key={ch} value={ch}>{lbl}</option>;
              })}
            </select>
          )}
          {selectMode && (
            <div className="flex items-center gap-[6px] flex-wrap text-[11px]">
              <span className="text-textItemBlur">{checked.size} selected</span>
              <button type="button" onClick={selectAll} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">All</button>
              <button type="button" onClick={() => setChecked(new Set())} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">None</button>
              <button type="button" onClick={exitSelect} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">Done</button>
              <button type="button" disabled={!checked.size || bulkBusy} onClick={() => doBulkKeyframe(true)}
                title="Mark the selected images as Video keyframes (they appear in the Video tab too)"
                className="px-[8px] h-[24px] rounded-[5px] border border-ai/40 text-ai font-[600] disabled:opacity-40 hover:bg-ai/10">▦ Make keyframe ({checked.size})</button>
              <button type="button" disabled={!checked.size || bulkBusy} onClick={() => doBulkKeyframe(false)}
                title="Remove the selected images from the keyframe pool (the images are kept)"
                className="px-[8px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur font-[600] disabled:opacity-40 hover:text-btnText">▦ Remove keyframe ({checked.size})</button>
              {confirmBulk ? (
                <>
                  <button type="button" disabled={!checked.size || bulkBusy} onClick={doBulkDelete} className="px-[8px] h-[24px] rounded-[5px] bg-[#ff7eb6] text-[#3a0d23] font-[700] disabled:opacity-50">{bulkBusy ? '…' : `Delete ${checked.size}`}</button>
                  <button type="button" onClick={() => setConfirmBulk(false)} className="px-[6px] h-[24px] rounded-[5px] border border-newBorder text-textItemBlur hover:text-btnText">Cancel</button>
                </>
              ) : (
                <button type="button" disabled={!checked.size} onClick={() => setConfirmBulk(true)} className="px-[8px] h-[24px] rounded-[5px] border border-[#ff7eb6]/40 text-[#ff7eb6] font-[600] disabled:opacity-40 hover:bg-[#ff7eb6]/10">Delete ({checked.size})</button>
              )}
            </div>
          )}
          {error && <span className="text-[12px] text-red-400">{error}</span>}
          {generating && (
            <span className="flex items-center gap-[6px] text-[11px] font-[600] text-ai">
              Rendering your shot
              <span className="inline-flex gap-[3px]">
                {[0, 150, 300].map((d) => <span key={d} className="h-[5px] w-[5px] rounded-full bg-ai animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </span>
            </span>
          )}
          {!loading && images.length === 0 && !generating ? (
            <div className="text-[12px] text-textItemBlur py-[14px]">No images yet. Generate with the AI Agent or ⬆ Upload your own.</div>
          ) : (
            <div className="grid grid-cols-2 gap-[8px] overflow-y-auto max-h-[60vh] pr-[2px]">
              {/* Generating placeholder — a pulsing tile with bouncing dots while a shot renders. */}
              {generating && (
                <span className="aspect-square rounded-[6px] border border-ai/40 bg-ai/5 flex flex-col items-center justify-center gap-[6px] animate-pulse">
                  <span className="inline-flex gap-[4px]">
                    {[0, 150, 300].map((d) => <span key={d} className="h-[7px] w-[7px] rounded-full bg-ai animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </span>
                  <span className="text-[9px] text-ai/80 font-[600]">Rendering…</span>
                </span>
              )}
              {visibleImages.map((img) => {
                const isChecked = checked.has(img.id);
                const ring = selectMode
                  ? (isChecked ? 'border-[#ff7eb6] ring-1 ring-[#ff7eb6]' : 'border-newBorder hover:border-btnText/40')
                  : (img.id === selectedId ? 'border-ai ring-1 ring-ai' : 'border-newBorder hover:border-btnText/40');
                return (
                  <button key={img.id} type="button" onClick={() => (selectMode ? toggleCheck(img.id) : setSelectedId(img.id))}
                    className={'relative aspect-square rounded-[6px] overflow-hidden border ' + ring}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.prompt || img.id} className="w-full h-full object-cover" />
                    {/* Channel chip — makes each reshaped variant instantly identifiable. */}
                    {img.channelShort && (
                      <span className="absolute bottom-[3px] left-[3px] right-[3px] truncate rounded-[4px] bg-ai/85 text-white text-[9px] font-[700] leading-none px-[4px] py-[3px] text-center">{img.channelShort}</span>
                    )}
                    {/* Edit-lineage chip — flags an agent/graphics edit + which op produced it. */}
                    {!img.channelShort && img.editOp && (
                      <span className="absolute bottom-[3px] left-[3px] right-[3px] truncate rounded-[4px] bg-btnPrimary/85 text-white text-[9px] font-[700] leading-none px-[4px] py-[3px] text-center">{img.editOp.replace(/_/g, ' ')}</span>
                    )}
                    {/* Keyframe badge — this image is also a Video keyframe (top-right; select check is top-left). */}
                    {img.keyframe && (
                      <span title="Also a Video keyframe" className="absolute top-[3px] right-[3px] h-[16px] rounded-[4px] bg-ai/90 text-white text-[9px] font-[700] leading-[16px] px-[4px] flex items-center">▦</span>
                    )}
                    {selectMode && (
                      <span className={'absolute top-[3px] left-[3px] h-[18px] w-[18px] rounded-[4px] border flex items-center justify-center text-[11px] leading-none ' + (isChecked ? 'bg-[#ff7eb6] border-[#ff7eb6] text-[#3a0d23]' : 'bg-black/45 border-white/50 text-transparent')}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right — the canvas for the selected image */}
        <div className={card + ' flex-1 min-w-0 flex flex-col gap-[12px]'}>
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-[13px] text-textItemBlur py-[60px] text-center">
              Select an image from the library to view it here.
            </div>
          ) : (
            <>
              {cropTool ? (
                <div className="rounded-[8px] border border-ai/40 bg-newBgColorInner p-[10px]">
                  <ImageCropOverlay url={selected.url} mode={cropTool} busy={cropBusy}
                    onModeChange={setCropTool} onCancel={() => setCropTool(null)} onApply={onCropApply} />
                </div>
              ) : (
                <div className="relative rounded-[8px] border border-newBorder overflow-hidden flex items-center justify-center min-h-[300px] max-h-[58vh]" style={CHECKER}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selected.url} alt={selected.prompt || selected.id} className="max-w-full max-h-[58vh] object-contain" />
                  {/* Photoshop-style tool toolbar pinned bottom-left — pick Crop or Zoom to drop a marquee. */}
                  <CropToolbar active={null} onPick={setCropTool} />
                </div>
              )}
              <div className="flex flex-wrap items-center gap-[8px]">
                <a href={selected.url} download className="h-[36px] px-[14px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText flex items-center hover:bg-boxHover">↓ Download</a>
                <button type="button" disabled={!state.activeAdId || added.has(selected.id)} onClick={addToAd}
                  title={state.activeAdId ? 'Add this image to the active ad' : 'Select a campaign + ad first'}
                  className="h-[36px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">
                  {added.has(selected.id) ? 'Added ✓' : '+ Add to ad'}
                </button>
                <button type="button" onClick={() => { setCaptureName(''); setCaptureOpen(true); }}
                  title="Save this image as a reusable Scene Director component (character / scene / lighting / …)"
                  className="h-[36px] px-[14px] rounded-[8px] border border-ai/40 text-ai text-[12px] font-[600] hover:bg-ai/10">★ Save as component</button>
                <button type="button" disabled={removingText} onClick={onRemoveText}
                  title="Detect + erase hallucinated text (fake captions / watermarks) — pixel-safe, keeps the subject untouched. New variant; original kept."
                  className="h-[36px] px-[14px] rounded-[8px] border border-ai/40 text-ai text-[12px] font-[600] hover:bg-ai/10 disabled:opacity-50">
                  {removingText ? '…' : '🧹 Remove text'}</button>
                {/* Images→Avatar bridge — tag this image so it appears in the avatar canvas portrait picker
                    (the avatar's Soul-generated shot / neutral headshot that HeyGen then animates). */}
                <button type="button" onClick={() => applyAvatarTag(!selected.avatarUse)}
                  title={selected.avatarUse ? 'Tagged for the avatar portrait picker — click to remove' : 'Tag this image so it appears in the avatar canvas portrait picker (HeyGen animates it)'}
                  className={'h-[36px] px-[14px] rounded-[8px] text-[12px] font-[600] ' + (selected.avatarUse ? 'bg-blue-500 text-white hover:opacity-90' : 'border border-blue-400/40 text-blue-400 hover:bg-blue-400/10')}>
                  {selected.avatarUse ? '🧑 Avatar ✓' : '🧑 Use for avatar'}
                </button>
                {selected.avatarUse && (
                  <input key={selected.id + '|' + (selected.avatarName || '')} defaultValue={selected.avatarName || ''} placeholder="name for the picker"
                    onBlur={(e) => { if (e.target.value !== (selected.avatarName || '')) applyAvatarTag(true, e.target.value); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="h-[36px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText w-[160px]" />
                )}
                {/* Keyframe promote/demote — one-click toggle of the keyframe flag (same asset, shows in
                    both libraries when marked). Filled when already a keyframe. */}
                <button type="button" disabled={kfBusy} onClick={doToggleKeyframe}
                  title={selected.keyframe ? 'This image is a Video keyframe — click to remove (the image is kept)' : 'Mark this image as a Video keyframe (it appears in the Video tab too)'}
                  className={'h-[36px] px-[14px] rounded-[8px] text-[12px] font-[600] disabled:opacity-50 ' + (selected.keyframe ? 'bg-ai text-white hover:opacity-90' : 'border border-ai/40 text-ai hover:bg-ai/10')}>
                  {kfBusy ? '…' : selected.keyframe ? '▦ Keyframe ✓' : '▦ Use as keyframe'}
                </button>
                {/* Capture Soul — dimmed until this image is saved as a Character; then it trains a Soul. */}
                <CanvasSoulButton imageId={selected.id} />
                {selected.spec && (
                  <button type="button" onClick={onTweak}
                    title="Reopen the Scene Director with this shot's spec to tweak + re-render a variant"
                    className="h-[36px] px-[14px] rounded-[8px] border border-ai/40 text-ai text-[12px] font-[600] hover:bg-ai/10">✎ Tweak</button>
                )}
                <a href={selected.url} target="_blank" rel="noreferrer" className="h-[36px] px-[14px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur flex items-center hover:text-btnText">Open ↗</a>
                <span className="ml-auto" />
                {confirmDel ? (
                  <span className="flex items-center gap-[8px]">
                    <span className="text-[12px] text-[#ff7eb6]">Delete this image from the brand?</span>
                    <button type="button" onClick={doDelete} className="h-[36px] px-[14px] rounded-[8px] bg-[#ff7eb6] text-[#3a0d23] text-[12px] font-[700]">Delete</button>
                    <button type="button" onClick={() => setConfirmDel(false)} className="h-[36px] px-[12px] rounded-[8px] border border-newBorder text-textItemBlur text-[12px] hover:text-btnText">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDel(true)}
                    className="h-[36px] px-[14px] rounded-[8px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[12px] font-[600] hover:bg-[#ff7eb6]/10">Delete</button>
                )}
              </div>
              {/* Reshape for a channel — non-destructive: produces a new channel-sized variant. */}
              <div className="flex flex-wrap items-center gap-[8px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[10px] py-[8px]">
                <span className="text-[12px] font-[600] text-btnText">Prep for a channel</span>
                <select value={reshapeChannel} onChange={(e) => setReshapeChannel(e.target.value)} title="Channel size"
                  className="h-[34px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText">
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.w}×{c.h})</option>)}
                </select>
                {/* Crop / Pad fit toggle */}
                <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden">
                  {(['crop', 'pad'] as const).map((f) => (
                    <button key={f} type="button" onClick={() => setReshapeFit(f)}
                      title={f === 'crop' ? 'Fill the frame (center-crop)' : 'Fit with padding (no crop)'}
                      className={'h-[34px] px-[12px] text-[12px] font-[600] capitalize ' + (reshapeFit === f ? 'bg-btnPrimary text-btnText' : 'text-textItemBlur hover:text-btnText')}>{f}</button>
                  ))}
                </span>
                {/* B1 — crop/pad preview of the selected image in the target channel aspect. */}
                {(() => {
                  const ch = channels.find((c) => c.id === reshapeChannel);
                  if (!ch) return null;
                  return (
                    <span className="h-[40px] rounded-[6px] border border-newBorder overflow-hidden bg-newBgColor flex items-center justify-center" style={{ width: `${Math.round(40 * (ch.w / ch.h))}px`, minWidth: '18px' }} title={`Preview · ${ch.w}×${ch.h}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selected.url} alt="preview" className={'w-full h-full ' + (reshapeFit === 'pad' ? 'object-contain' : 'object-cover')} />
                    </span>
                  );
                })()}
                <button type="button" onClick={onReshape} disabled={reshaping || !reshapeChannel}
                  className="h-[34px] px-[14px] rounded-[8px] bg-ai text-white text-[12px] font-[700] hover:opacity-90 disabled:opacity-50">
                  {reshaping ? 'Reshaping…' : `Reshape to ${channels.find((c) => c.id === reshapeChannel)?.short ?? 'channel'}`}
                </button>
                <button type="button" onClick={onExportAll} disabled={exportingAll || reshaping}
                  title="Reshape to all social channel sizes at once"
                  className="h-[34px] px-[12px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText hover:bg-boxHover disabled:opacity-50">
                  {exportingAll ? 'Exporting…' : 'Export all'}
                </button>
                <span className="text-[10px] text-textItemBlur">New variant — original kept.</span>
              </div>

              {/* Metadata */}
              <div className="text-[11px] text-textItemBlur flex flex-col gap-[3px]">
                {selected.channelLabel && <span className="text-[12px] font-[700] text-ai">{selected.channelLabel} · {selected.w}×{selected.h}{selected.fit ? ` · ${selected.fit}` : ''}</span>}
                {selected.spec && (() => {
                  const s = selected.spec as Record<string, string>;
                  const used = ['subject', 'environment', 'lighting', 'style'].map((k) => s[k]).filter(Boolean).map((v) => String(v).split(',')[0].slice(0, 28));
                  return <span className="text-[12px] font-[600] text-ai">✨ Scene Director · {selected.renderMode || 'layered'}{used.length ? ` · ${used.join(' · ')}` : ''}</span>;
                })()}
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
      </div>

      {/* Save-as-component modal */}
      {captureOpen && selected && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => !capturing && setCaptureOpen(false)}>
          <div className="w-[420px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[18px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <span className="text-[14px] font-[700] text-btnText">Save as a reusable component</span>
            <span className="text-[12px] text-textItemBlur">Reuse this across shots (and video keyframes) — a character holds its identity when restaged.</span>
            <label className="flex flex-col gap-[3px]">
              <span className="text-[11px] font-[600] text-textItemBlur">Type</span>
              <select value={captureKind} onChange={(e) => setCaptureKind(e.target.value)} className="h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText">
                {COMPONENT_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-[3px]">
              <span className="text-[11px] font-[600] text-textItemBlur">Name</span>
              <input value={captureName} autoFocus onChange={(e) => setCaptureName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void onCaptureComponent(); } if (e.key === 'Escape') setCaptureOpen(false); }}
                placeholder="e.g. Sarah, Downtown loft, Golden key light"
                className="h-[38px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur" />
            </label>
            {error && <span className="text-[12px] text-red-400">{error}</span>}
            <div className="flex items-center justify-end gap-[8px]">
              <button type="button" onClick={() => setCaptureOpen(false)} className="h-[34px] px-[14px] rounded-[8px] border border-newBorder text-textItemBlur text-[12px] hover:text-btnText">Cancel</button>
              <button type="button" onClick={() => void onCaptureComponent()} disabled={capturing || !captureName.trim()}
                className="h-[34px] px-[16px] rounded-[8px] bg-ai text-white text-[12px] font-[700] hover:opacity-90 disabled:opacity-50">{capturing ? 'Saving…' : 'Save component'}</button>
            </div>
          </div>
        </div>, document.body)}

      {/* Upload modal */}
      {uploadOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => setUploadOpen(false)}>
          <div className="w-[560px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-[8px]">
              <span className="text-[15px] font-[700] text-btnText flex-1">Upload images to {brandName}</span>
              <button type="button" onClick={() => setUploadOpen(false)} className="h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText">✕</button>
            </div>
            <span className="text-[12px] text-textItemBlur">Drag &amp; drop or browse — PNG, JPG, SVG, WEBP. They’re added to this brand’s library.</span>
            <StudioDropZone accept="image" brandKitId={brandKitId} onUploaded={onUploaded} />
          </div>
        </div>, document.body)}
    </div>
  );
};

export default StudioImagesPanel;
