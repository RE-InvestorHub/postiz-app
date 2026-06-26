'use client';

// Supers drag canvas — free pixel-drag positioning of supers over a preview of the
// source image (option B). Each super (headline/sub/CTA/callouts/logo) is an absolutely
// positioned, draggable DOM element; dragging updates NORMALIZED (0..1) coordinates that
// the brain's brandlayer renders authoritatively. The DOM here only APPROXIMATES the
// final render (kit colors, canvas-relative sizes, backdrop pills). Postiz tokens.

import { FC, useCallback, useRef } from 'react';
import { BrandRoles } from '@gitroom/frontend/components/studio/studio.composer-client';

export interface SupersLayoutElement { key: string; x: number; y: number; size?: number; backdrop?: boolean }
// baseAspect = the channel dims the layout was authored against (the canvas previewAspect channel).
// The brain re-anchors from it per output channel; absent → no re-anchor (back-compat).
export interface SupersLayout { elements: SupersLayoutElement[]; baseAspect?: { w: number; h: number } }
export interface SupersCopy { headline?: string; sub?: string; cta?: string; data?: { label: string; value: string }[] }

// Default normalized positions (~the fixed composition) so the canvas has somewhere to start.
const DEFAULTS: Record<string, { x: number; y: number }> = {
  headline: { x: 0.5, y: 0.84 }, sub: { x: 0.5, y: 0.77 }, cta: { x: 0.28, y: 0.93 }, logo: { x: 0.9, y: 0.9 },
};
function defaultPos(key: string): { x: number; y: number } {
  if (DEFAULTS[key]) return DEFAULTS[key];
  const m = /^callout:(\d+)$/.exec(key);
  if (m) return { x: 0.13, y: 0.1 + Number(m[1]) * 0.12 };
  return { x: 0.5, y: 0.5 };
}

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function elementsFromCopy(copy: SupersCopy): { key: string; text: string; kind: 'text' | 'cta' | 'callout' | 'logo' }[] {
  const els: { key: string; text: string; kind: 'text' | 'cta' | 'callout' | 'logo' }[] = [];
  if (copy.headline?.trim()) els.push({ key: 'headline', text: copy.headline, kind: 'text' });
  if (copy.sub?.trim()) els.push({ key: 'sub', text: copy.sub, kind: 'text' });
  if (copy.cta?.trim()) els.push({ key: 'cta', text: copy.cta, kind: 'cta' });
  (copy.data || []).forEach((c, i) => { if (c.value?.trim() || c.label?.trim()) els.push({ key: `callout:${i}`, text: c.value ? `${c.value} ${c.label}`.trim() : c.label, kind: 'callout' }); });
  els.push({ key: 'logo', text: 'Re:', kind: 'logo' });
  return els;
}

/** Build a full default layout for the current copy (used to seed editing / Reset). */
export function defaultLayout(copy: SupersCopy): SupersLayout {
  return { elements: elementsFromCopy(copy).map((e) => ({ key: e.key, ...defaultPos(e.key), size: 1, backdrop: e.kind !== 'logo' && e.kind !== 'cta' })) };
}

export const StudioSupersCanvas: FC<{
  imageUrl: string | null;
  aspect: number;            // width / height
  copy: SupersCopy;
  roles: BrandRoles;
  layout: SupersLayout;
  onChange: (l: SupersLayout) => void;
}> = ({ imageUrl, aspect, copy, roles, layout, onChange }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);

  const surface = roles.surface || '#05203D';
  const onSurface = roles.onSurface || '#FFFFFF';
  const primary = roles.primary || '#5279BC';
  const accent = roles.accent || '#42B75E';

  const posOf = (key: string) => layout.elements.find((e) => e.key === key) ?? { key, ...defaultPos(key), size: 1, backdrop: true };
  const setEl = (key: string, patch: Partial<SupersLayoutElement>) => {
    const exists = layout.elements.some((e) => e.key === key);
    const next = exists
      ? layout.elements.map((e) => (e.key === key ? { ...e, ...patch } : e))
      : [...layout.elements, { key, ...defaultPos(key), size: 1, backdrop: true, ...patch }];
    onChange({ elements: next });
  };

  const onMove = useCallback((e: PointerEvent) => {
    const key = dragging.current; const box = boxRef.current;
    if (!key || !box) return;
    const r = box.getBoundingClientRect();
    setEl(key, { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) });
  }, [layout]);
  const stop = useCallback(() => { dragging.current = null; window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', stop); }, [onMove]);
  const startDrag = (key: string) => (e: React.PointerEvent) => { e.preventDefault(); dragging.current = key; window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', stop); };

  const els = elementsFromCopy(copy);

  return (
    <div className="flex flex-col gap-[8px]">
      <div ref={boxRef} className="relative w-full max-w-[360px] mx-auto rounded-[8px] overflow-hidden border border-newBorder bg-black select-none"
        style={{ aspectRatio: String(aspect) }}>
        {imageUrl
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={imageUrl} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          : <div className="absolute inset-0 flex items-center justify-center text-[12px] text-textItemBlur">no source image</div>}
        {els.map((el) => {
          const p = posOf(el.key);
          const common: React.CSSProperties = { position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, transform: 'translate(-50%,-50%)', cursor: 'grab', fontSize: `${(el.kind === 'callout' ? 13 : 12) * (p.size || 1)}px`, lineHeight: 1.1, whiteSpace: 'nowrap', maxWidth: '92%' };
          if (el.kind === 'logo') return <div key={el.key} onPointerDown={startDrag(el.key)} style={{ ...common, background: '#fff', color: surface, fontWeight: 700, padding: '4px 6px', borderRadius: 4 }}>Re:</div>;
          if (el.kind === 'cta') return <div key={el.key} onPointerDown={startDrag(el.key)} style={{ ...common, background: primary, color: '#fff', fontWeight: 600, padding: '5px 12px', borderRadius: 999 }}>{el.text}</div>;
          const bg = p.backdrop !== false ? `${surface}E6` : 'transparent';
          const borderLeft = el.kind === 'callout' ? `3px solid ${accent}` : undefined;
          return <div key={el.key} onPointerDown={startDrag(el.key)} style={{ ...common, background: bg, color: onSurface, fontWeight: el.key === 'headline' ? 700 : 500, padding: '4px 8px', borderRadius: 6, borderLeft, overflow: 'hidden', textOverflow: 'ellipsis' }}>{el.text}</div>;
        })}
      </div>

      {/* Per-element size + backdrop controls */}
      <div className="flex flex-col gap-[4px]">
        {els.map((el) => {
          const p = posOf(el.key);
          return (
            <div key={el.key} className="flex items-center gap-[8px] text-[11px] text-textItemBlur">
              <span className="w-[88px] truncate text-btnText">{el.key}</span>
              <input type="range" min={0.6} max={2} step={0.1} value={p.size || 1} onChange={(e) => setEl(el.key, { size: Number(e.target.value) })} className="flex-1" />
              {el.kind !== 'logo' && el.kind !== 'cta' && (
                <label className="flex items-center gap-[4px] cursor-pointer"><input type="checkbox" checked={p.backdrop !== false} onChange={(e) => setEl(el.key, { backdrop: e.target.checked })} />bg</label>
              )}
            </div>
          );
        })}
        <button type="button" onClick={() => onChange(defaultLayout(copy))} className="self-start h-[28px] px-[10px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600]">Reset positions</button>
      </div>
      <p className="text-[11px] text-textItemBlur text-center">Drag supers to position them. Preview is approximate — the composed result is exact.</p>
    </div>
  );
};
