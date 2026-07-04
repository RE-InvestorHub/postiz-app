'use client';

// studio.image-crop-overlay.tsx — a draggable crop / zoom marquee for the Images-tab canvas.
//
// Self-contained (merge-safe new file). The entry point is a small Photoshop-style toolbar
// (CropToolbar) pinned to the bottom-left of the canvas: two square icon buttons (Crop, Zoom).
// Picking one drops a marquee the user drags + resizes, with aspect-ratio presets, a rule-of-thirds
// guide, and a live source-px W×H readout. Apply hands the parent a SOURCE-pixel rect + the mode:
//   - 'crop' → parent calls editImage(id, 'crop', rect)                         (a tighter frame)
//   - 'zoom' → parent crops, then scales the crop back up toward the source's   (closer to a face,
//     long edge so resolution is preserved                                       resolution kept)
// Both ride the existing FREE, sandboxed, lineage-tracked /images/edit ops — no new backend.
//
// Geometry: the marquee is stored in FRACTIONS of the displayed image (0..1), so it is independent
// of the on-screen scale and maps to source pixels by multiplying by naturalWidth/Height at apply.

import { FC, useCallback, useEffect, useRef, useState } from 'react';

export interface CropRect { x: number; y: number; width: number; height: number }
export type CropTool = 'crop' | 'zoom';

// --- Icons (lucide-style, currentColor so they theme with the button) ---------
const CropIcon: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" />
  </svg>
);
const ZoomIcon: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /><path d="M11 8v6" /><path d="M8 11h6" />
  </svg>
);

/**
 * The on-canvas tool toolbar — two square icons pinned bottom-left (Photoshop-style). Rendered over
 * the plain image (to ENTER a tool) and inside the marquee (to SWITCH tool). `active` highlights the
 * current tool; `onPick` sets it.
 */
export const CropToolbar: FC<{ active: CropTool | null; onPick: (t: CropTool) => void }> = ({ active, onPick }) => {
  const btn = (tool: CropTool, label: string, icon: React.ReactNode) => (
    <button type="button" title={label} aria-label={label} onClick={() => onPick(tool)}
      className={'h-[30px] w-[30px] rounded-[6px] flex items-center justify-center transition-colors ' +
        (active === tool ? 'bg-ai text-btnText' : 'text-white/85 hover:bg-white/20')}>
      {icon}
    </button>
  );
  return (
    <div className="absolute bottom-[8px] left-[8px] z-10 flex flex-col gap-[4px] rounded-[8px] border border-white/15 bg-black/55 p-[4px] backdrop-blur-sm">
      {btn('crop', 'Crop — trim to a tighter frame', <CropIcon />)}
      {btn('zoom', 'Zoom in — crop then upscale (closer, sharp)', <ZoomIcon />)}
    </div>
  );
};

// Aspect presets expressed as source width:height. `null` = free-form.
const RATIOS: { id: string; label: string; r: number | null }[] = [
  { id: 'free', label: 'Free', r: null },
  { id: '1:1', label: '1:1', r: 1 },
  { id: '4:5', label: '4:5', r: 4 / 5 },
  { id: '9:16', label: '9:16', r: 9 / 16 },
  { id: '16:9', label: '16:9', r: 16 / 9 },
];

type Frac = { fx: number; fy: number; fw: number; fh: number };
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const ImageCropOverlay: FC<{
  url: string;
  mode: CropTool;
  busy?: boolean;
  onModeChange: (t: CropTool) => void;
  onCancel: () => void;
  onApply: (rect: CropRect, mode: CropTool) => void;
}> = ({ url, mode, busy, onModeChange, onCancel, onApply }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  // Marquee in image fractions; default a centered 60% box.
  const [m, setM] = useState<Frac>({ fx: 0.2, fy: 0.2, fw: 0.6, fh: 0.6 });
  const drag = useRef<{ mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; sx: number; sy: number; start: Frac } | null>(null);

  // Apply the active aspect ratio (source w:h) by deriving height from width, keeping the box in-frame.
  const applyRatio = useCallback((r: number | null, base: Frac): Frac => {
    if (!r || !nat) return base;
    // fh (fraction of height) so that (fw*natW)/(fh*natH) === r  →  fh = fw*natW / (r*natH)
    let fw = base.fw;
    let fh = (fw * nat.w) / (r * nat.h);
    if (fh > 1) { fh = 1; fw = (fh * r * nat.h) / nat.w; }
    const fx = clamp01(Math.min(base.fx, 1 - fw));
    const fy = clamp01(Math.min(base.fy, 1 - fh));
    return { fx, fy, fw, fh };
  }, [nat]);

  useEffect(() => { if (ratio != null) setM((cur) => applyRatio(ratio, cur)); }, [ratio, applyRatio]);

  const onPointerDown = (dm: 'move' | 'nw' | 'ne' | 'sw' | 'se') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { mode: dm, sx: e.clientX, sy: e.clientY, start: m };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; const box = wrapRef.current;
    if (!d || !box) return;
    const rect = box.getBoundingClientRect();
    const dx = (e.clientX - d.sx) / rect.width;
    const dy = (e.clientY - d.sy) / rect.height;
    const s = d.start;
    if (d.mode === 'move') {
      setM({ ...s, fx: clamp01(Math.min(s.fx + dx, 1 - s.fw)), fy: clamp01(Math.min(s.fy + dy, 1 - s.fh)) });
      return;
    }
    // Corner resize: anchor the opposite corner, then re-lock the aspect if one is set.
    let { fx, fy, fw, fh } = s;
    const right = s.fx + s.fw, bottom = s.fy + s.fh;
    if (d.mode === 'nw') { fx = clamp01(Math.min(s.fx + dx, right - 0.05)); fy = clamp01(Math.min(s.fy + dy, bottom - 0.05)); fw = right - fx; fh = bottom - fy; }
    if (d.mode === 'ne') { fy = clamp01(Math.min(s.fy + dy, bottom - 0.05)); fw = clamp01(Math.min(s.fw + dx, 1 - s.fx)); fh = bottom - fy; }
    if (d.mode === 'sw') { fx = clamp01(Math.min(s.fx + dx, right - 0.05)); fw = right - fx; fh = clamp01(Math.min(s.fh + dy, 1 - s.fy)); }
    if (d.mode === 'se') { fw = clamp01(Math.min(s.fw + dx, 1 - s.fx)); fh = clamp01(Math.min(s.fh + dy, 1 - s.fy)); }
    let next: Frac = { fx, fy, fw: Math.max(0.05, fw), fh: Math.max(0.05, fh) };
    if (ratio != null && nat) {
      const rr = applyRatio(ratio, next);
      next = { ...rr, fx: d.mode === 'nw' || d.mode === 'sw' ? clamp01(Math.min(next.fx, 1 - rr.fw)) : next.fx };
    }
    setM(next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (drag.current) { try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ } }
    drag.current = null;
  };

  // Source-pixel rect from the current fractions.
  const toRect = (): CropRect | null => {
    if (!nat) return null;
    const x = Math.round(m.fx * nat.w), y = Math.round(m.fy * nat.h);
    const width = Math.max(1, Math.round(m.fw * nat.w)), height = Math.max(1, Math.round(m.fh * nat.h));
    return { x, y, width: Math.min(width, nat.w - x), height: Math.min(height, nat.h - y) };
  };
  const rect = toRect();

  const handle = 'absolute h-[14px] w-[14px] rounded-full bg-ai border-2 border-white shadow';
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

  return (
    <div className="flex flex-col gap-[10px]">
      <div ref={wrapRef} className="relative self-center max-w-full" style={{ lineHeight: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="crop source"
          draggable={false}
          onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth || 1, h: e.currentTarget.naturalHeight || 1 })}
          className="block max-w-full max-h-[58vh] object-contain select-none"
        />
        {/* Dim outside the marquee (four bands) so the kept region pops. */}
        <div className="absolute inset-0" onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          <div className="absolute bg-black/55" style={{ left: 0, right: 0, top: 0, height: pct(m.fy) }} />
          <div className="absolute bg-black/55" style={{ left: 0, right: 0, bottom: 0, top: pct(m.fy + m.fh) }} />
          <div className="absolute bg-black/55" style={{ top: pct(m.fy), height: pct(m.fh), left: 0, width: pct(m.fx) }} />
          <div className="absolute bg-black/55" style={{ top: pct(m.fy), height: pct(m.fh), right: 0, left: pct(m.fx + m.fw) }} />
          {/* Marquee */}
          <div
            className="absolute border-2 border-ai cursor-move"
            style={{ left: pct(m.fx), top: pct(m.fy), width: pct(m.fw), height: pct(m.fh) }}
            onPointerDown={onPointerDown('move')}
          >
            {/* rule-of-thirds guides */}
            <div className="absolute inset-0 pointer-events-none opacity-60">
              <div className="absolute top-1/3 left-0 right-0 h-px bg-white/40" />
              <div className="absolute top-2/3 left-0 right-0 h-px bg-white/40" />
              <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/40" />
              <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/40" />
            </div>
            <span className={handle} style={{ left: -7, top: -7, cursor: 'nwse-resize' }} onPointerDown={onPointerDown('nw')} />
            <span className={handle} style={{ right: -7, top: -7, cursor: 'nesw-resize' }} onPointerDown={onPointerDown('ne')} />
            <span className={handle} style={{ left: -7, bottom: -7, cursor: 'nesw-resize' }} onPointerDown={onPointerDown('sw')} />
            <span className={handle} style={{ right: -7, bottom: -7, cursor: 'nwse-resize' }} onPointerDown={onPointerDown('se')} />
          </div>
        </div>
        {/* On-canvas tool toolbar (bottom-left) — switch crop ↔ zoom without leaving the marquee. */}
        <CropToolbar active={mode} onPick={onModeChange} />
      </div>

      {/* Options bar */}
      <div className="flex flex-wrap items-center gap-[8px]">
        <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden">
          {RATIOS.map((x) => (
            <button key={x.id} type="button" onClick={() => setRatio(x.r)}
              className={'h-[32px] px-[10px] text-[12px] font-[600] ' + ((ratio === x.r || (x.r === null && ratio === null)) ? 'bg-btnPrimary text-btnText' : 'text-textItemBlur hover:text-btnText')}>
              {x.label}
            </button>
          ))}
        </span>
        <span className="text-[11px] text-textItemBlur">{rect ? `${rect.width}×${rect.height}px` : 'loading…'}</span>
        <span className="ml-auto" />
        <button type="button" onClick={onCancel} disabled={busy}
          className="h-[34px] px-[12px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText disabled:opacity-50">Cancel</button>
        <button type="button" onClick={() => rect && onApply(rect, mode)} disabled={busy || !rect}
          className="h-[34px] px-[16px] rounded-[8px] bg-ai text-btnText text-[12px] font-[700] hover:opacity-90 disabled:opacity-50">
          {busy ? '…' : mode === 'zoom' ? '🔍 Apply zoom' : '⛶ Apply crop'}
        </button>
      </div>
    </div>
  );
};
