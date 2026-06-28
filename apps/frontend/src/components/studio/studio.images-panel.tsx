'use client';

// Images tab — a brand-scoped image LIBRARY laid out like the Brand tab: a left sidebar
// list of the brand's images + a right "canvas" showing the selected image with its actions
// (download / + Add to ad / delete). A top bar carries the Model · Aspect · Resolution
// settings (used by the AI Agent) + an Upload button. Generation lives in the AI Agent for
// now. Postiz tokens only.

import { FC, useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { listBrandImages, deleteBrandImage, BrandImage } from '@gitroom/frontend/components/studio/studio.image-client';

type ModelOpt = { value: string; label: string; credits: string };
interface StudioImagesPanelProps {
  caps: Record<string, { handler: (args?: any) => unknown }>;
  models: ModelOpt[];
  aspects: string[];
  resolutions: string[];
}

// Subtle checkerboard so transparent PNGs read on the canvas.
const CHECKER: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(45deg,rgba(255,255,255,.04) 25%,transparent 25%),linear-gradient(-45deg,rgba(255,255,255,.04) 25%,transparent 25%),linear-gradient(45deg,transparent 75%,rgba(255,255,255,.04) 75%),linear-gradient(-45deg,transparent 75%,rgba(255,255,255,.04) 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0,0 10px,10px -10px,-10px 0',
};

export const StudioImagesPanel: FC<StudioImagesPanelProps> = ({ caps, models, aspects, resolutions }) => {
  const { state } = useStudio();
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

  const selected = images.find((i) => i.id === selectedId) || null;

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

  // Keep the selected model valid for the Images tab.
  useEffect(() => {
    if (models.length && !models.some((m) => m.value === state.model)) {
      caps['studio.selectModel']?.handler({ model: models[0].value });
    }
  }, [models, state.model, caps]);

  const onUploaded = (_a: UploadedAsset) => { void load(); };
  const addToAd = async () => {
    if (!state.activeAdId || !selected) return;
    try { await addObject({ adId: state.activeAdId, type: 'image', id: selected.id }); setAdded((s) => new Set(s).add(selected.id)); }
    catch { /* keep resilient */ }
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

  const card = 'rounded-[8px] border border-newBorder bg-newBgColor p-[16px]';
  const selectCls = 'h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText';

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Top bar: generation SETTINGS (used by the AI Agent) + Upload */}
      <div className="flex flex-wrap items-center gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[10px]">
        <select value={state.model} onChange={(e) => caps['studio.selectModel']?.handler({ model: e.target.value })} className={selectCls} title="Image model">
          {models.map((m) => (<option key={m.value} value={m.value}>{m.label} ({m.credits})</option>))}
        </select>
        <select value={state.aspectRatio} onChange={(e) => caps['studio.setAspectRatio']?.handler({ aspectRatio: e.target.value })} className={selectCls} title="Size / aspect ratio">
          {aspects.map((a) => (<option key={a} value={a}>{a}</option>))}
        </select>
        <select value={state.resolution} onChange={(e) => caps['studio.setResolution']?.handler({ resolution: e.target.value })} className={selectCls} title="Resolution">
          {resolutions.map((r) => (<option key={r} value={r}>{r.toUpperCase()}</option>))}
        </select>
        <span className="text-[11px] text-textItemBlur hidden lg:inline">Generate from the AI Agent — these settings apply.</span>
        <button type="button" onClick={() => setUploadOpen(true)}
          className="ml-auto h-[36px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] hover:opacity-90">⬆ Upload</button>
      </div>

      <div className="flex flex-col md:flex-row gap-[14px]">
        {/* Left sidebar — the brand's image library */}
        <div className={card + ' md:w-[260px] shrink-0 flex flex-col gap-[10px]'}>
          <div className="flex items-center gap-[8px]">
            <span className="text-[14px] font-[600] text-btnText flex-1">Image library</span>
            <span className="text-[11px] text-textItemBlur">{loading ? '…' : images.length}</span>
          </div>
          {error && <span className="text-[12px] text-red-400">{error}</span>}
          {!loading && images.length === 0 ? (
            <div className="text-[12px] text-textItemBlur py-[14px]">No images yet. Generate with the AI Agent or ⬆ Upload your own.</div>
          ) : (
            <div className="grid grid-cols-2 gap-[8px] overflow-y-auto max-h-[60vh] pr-[2px]">
              {images.map((img) => (
                <button key={img.id} type="button" onClick={() => setSelectedId(img.id)}
                  className={'aspect-square rounded-[6px] overflow-hidden border ' + (img.id === selectedId ? 'border-ai ring-1 ring-ai' : 'border-newBorder hover:border-btnText/40')}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.prompt || img.id} className="w-full h-full object-cover" />
                </button>
              ))}
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
              <div className="rounded-[8px] border border-newBorder overflow-hidden flex items-center justify-center min-h-[300px] max-h-[58vh]" style={CHECKER}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={selected.url} alt={selected.prompt || selected.id} className="max-w-full max-h-[58vh] object-contain" />
              </div>
              <div className="flex flex-wrap items-center gap-[8px]">
                <a href={selected.url} download className="h-[36px] px-[14px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText flex items-center hover:bg-boxHover">↓ Download</a>
                <button type="button" disabled={!state.activeAdId || added.has(selected.id)} onClick={addToAd}
                  title={state.activeAdId ? 'Add this image to the active ad' : 'Select a campaign + ad first'}
                  className="h-[36px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">
                  {added.has(selected.id) ? 'Added ✓' : '+ Add to ad'}
                </button>
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
              {/* Metadata */}
              <div className="text-[11px] text-textItemBlur flex flex-col gap-[3px]">
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
