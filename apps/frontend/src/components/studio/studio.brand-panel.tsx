'use client';

// Brand tab — a library of Brands + a preview-first editor. A Brand is the
// elevated Brand Kit: persona + 4-role palette (8 swatches) + 3 font roles + 5
// logo slots. The ONLY hard requirement to be "live" (Composer-usable) is all 5
// logos; colors/fonts/voice are a partial→complete gradation surfaced as a
// checklist + toast guidance. Postiz tokens only. Reuses the brain upload flow.

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';
import {
  Brand, ColorRole, LogoSlot, LOGO_SLOTS, LOGO_SLOT_LABELS,
  listBrands, getBrand, createBrand, updateBrand, addBrandFile, deleteBrand, extractBrandFromAsset, logoUrl,
  completeBrandPalette, suggestBrandFonts, draftBrandVoice, generateBrandLogos,
} from '@gitroom/frontend/components/studio/studio.brand-client';

const FONTS = [
  'Plus Jakarta Sans', 'Helvetica Neue', 'Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins',
  'Lora', 'Playfair Display', 'Merriweather', 'Oswald', 'Raleway', 'Work Sans', 'Nunito', 'Source Sans 3',
];
// The 8 palette cells: 4 roles × {base, alt}. Labels per the locked spec.
const PALETTE_CELLS: { role: ColorRole; shade: 'base' | 'alt'; label: string }[] = [
  { role: 'primary', shade: 'base', label: 'Primary' }, { role: 'primary', shade: 'alt', label: 'Primary (alt)' },
  { role: 'secondary', shade: 'base', label: 'Secondary' }, { role: 'secondary', shade: 'alt', label: 'Secondary (alt)' },
  { role: 'neutral', shade: 'base', label: 'Neutral (dark)' }, { role: 'neutral', shade: 'alt', label: 'Neutral (light)' },
  { role: 'accent', shade: 'base', label: 'Accent' }, { role: 'accent', shade: 'alt', label: 'Accent (alt)' },
];
const FONT_ROLES: { key: 'primary' | 'secondary' | 'accent'; label: string }[] = [
  { key: 'primary', label: 'Primary' }, { key: 'secondary', label: 'Secondary' }, { key: 'accent', label: 'Accent' },
];

const msg = (e: unknown) => (e as Error)?.message ?? String(e);
const kindFor = (name: string) => (/\.(svg)$/i.test(name) ? 'svg' : 'png');

const StatusPill: FC<{ b: Brand }> = ({ b }) => {
  const map = { complete: ['Complete', 'text-[#1db97a] border-[#1db97a]/40'], live: ['Live', 'text-ai border-ai/40'], incomplete: ['Draft', 'text-[#ff7eb6] border-[#ff7eb6]/40'] } as const;
  const [label, cls] = map[b.tier] ?? map.incomplete;
  return <span className={`text-[10px] uppercase tracking-wide font-[700] px-[8px] py-[2px] rounded-full border ${cls}`}>{label}</span>;
};

export const StudioBrandPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brand, setBrand] = useState<Brand | null>(null);   // the one being edited
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<LogoSlot | null>(null);
  const [importModal, setImportModal] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    try { setBrands(await listBrands()); } catch (e) { setError(msg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Open the active brand (or the first custom one) for editing on mount.
  useEffect(() => {
    const id = state.composerBrandKitId && state.composerBrandKitId !== 'default' ? state.composerBrandKitId : null;
    if (id) getBrand(id).then(setBrand).catch(() => {});
  }, [state.composerBrandKitId]);

  const select = async (id: string) => {
    setError(null);
    try { const b = await getBrand(id); setBrand(b); dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: id }); }
    catch (e) { setError(msg(e)); }
  };

  const refresh = async (id: string) => { const b = await getBrand(id); setBrand(b); await load(); return b; };

  const doCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true); setError(null);
    try {
      const b = await createBrand({ name: newName.trim() });
      setNewName(''); setCreating(false);
      await load(); setBrand(b);
      dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: b.brand_kit_id });
      toaster.show('Brand created — add all 5 logos to make it usable in the Composer.', 'warning');
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  const patch = async (p: Parameters<typeof updateBrand>[1]) => {
    if (!brand || brand.builtin) return;
    try {
      const before = brand.status;
      const updated = await updateBrand(brand.brand_kit_id, p);
      setBrand(updated); await load();
      if (before !== 'live' && updated.status === 'live') toaster.show('This brand is now live — it can be used in the Composer.', 'success');
    } catch (e) { setError(msg(e)); }
  };

  const [assisting, setAssisting] = useState<string | null>(null);
  const runAssist = async (which: 'palette' | 'fonts' | 'voice' | 'logo') => {
    if (!brand || brand.builtin || assisting) return;
    setAssisting(which); setError(null);
    try {
      const before = brand.status;
      const fn = { palette: completeBrandPalette, fonts: suggestBrandFonts, voice: draftBrandVoice, logo: generateBrandLogos }[which];
      const updated = await fn(brand.brand_kit_id);
      setBrand(updated); await load();
      if (before !== 'live' && updated.status === 'live') toaster.show('This brand is now live!', 'success');
      else toaster.show(which === 'logo' ? 'Logo generated and applied to the 5 slots — refine any slot as needed.' : 'Applied — review and tweak.', 'success');
    } catch (e) { setError(msg(e)); } finally { setAssisting(null); }
  };

  // Import from an uploaded brand asset (logo / brand board / palette) → vision extraction → apply.
  const onImportUpload = async (asset: UploadedAsset) => {
    if (!brand || brand.builtin) return;
    setImporting(true); setError(null);
    try {
      const ex = await extractBrandFromAsset(asset.assetId, asset.kind === 'image' ? undefined : asset.kind);
      const applied = (ex.palette?.length || Object.keys(ex.typography || {}).length || Object.keys(ex.persona || {}).length);
      if (applied) await patch({
        ...(ex.palette?.length ? { palette: ex.palette } : {}),
        ...(ex.typography && Object.keys(ex.typography).length ? { typography: ex.typography } : {}),
        ...(ex.persona && Object.keys(ex.persona).length ? { persona: ex.persona } : {}),
      });
      setImportModal(false);
      toaster.show(applied ? 'Brand info extracted from your file — review the palette, fonts and voice, then add your 5 logos.' : 'Couldn\'t read brand info from that file — try a brand board or palette image.', applied ? 'success' : 'warning');
    } catch (e) { setError(msg(e)); } finally { setImporting(false); }
  };

  const setSwatch = (role: ColorRole, shade: 'base' | 'alt', hex: string) => {
    if (!brand) return;
    const others = (brand.palette || []).filter((s) => !(s.role === role && (s.shade || 'base') === shade));
    const label = PALETTE_CELLS.find((c) => c.role === role && c.shade === shade)?.label;
    void patch({ palette: [...others, { role, shade, hex, name: label }] });
  };
  const swatchHex = (role: ColorRole, shade: 'base' | 'alt') =>
    (brand?.palette || []).find((s) => s.role === role && (s.shade || 'base') === shade)?.hex;

  const pickLogo = (slot: LogoSlot) => { pendingSlot.current = slot; uploadRef.current?.click(); };
  const onLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; const slot = pendingSlot.current;
    e.target.value = '';
    if (!file || !slot || !brand) return;
    setBusy(true); setError(null);
    try {
      const asset = await uploadFileToBrain(file, () => {});
      const before = brand.status;
      const updated = await addBrandFile(brand.brand_kit_id, { slot, assetId: asset.assetId, kind: kindFor(file.name) });
      setBrand(updated); await load();
      if (before !== 'live' && updated.status === 'live') toaster.show('All 5 logos set — this brand is now live!', 'success');
    } catch (err) { setError(msg(err)); } finally { setBusy(false); }
  };

  const doDelete = async () => {
    if (!brand || brand.builtin) return;
    setBusy(true);
    try { await deleteBrand(brand.brand_kit_id); if (state.composerBrandKitId === brand.brand_kit_id) dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: 'default' }); setBrand(null); await load(); }
    catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  // ---- styles ----
  const card = 'rounded-[8px] border border-newBorder bg-newBgColor p-[16px]';
  const ctrl = 'h-[36px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText px-[10px]';
  const sectionTitle = 'text-[12px] font-[600] text-textItemBlur uppercase tracking-wide';

  return (
    <div className="flex flex-col md:flex-row gap-[14px]">
      {/* hidden file input shared by logo slots */}
      <input ref={uploadRef} type="file" accept="image/*,.svg" className="sr-only" aria-hidden="true" onChange={onLogoFile} />

      {/* Library */}
      <div className={card + ' md:w-[260px] shrink-0 flex flex-col gap-[10px]'}>
        <div className="flex items-center gap-[8px]">
          <span className="text-[14px] font-[600] text-btnText flex-1">Brands</span>
          <button type="button" onClick={() => { setCreating(true); setNewName(''); }}
            className="h-[30px] px-[10px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600]">+ New</button>
        </div>
        {brands.map((b) => (
          <button key={b.brand_kit_id} type="button" onClick={() => select(b.brand_kit_id)}
            className={'flex items-center gap-[8px] rounded-[8px] border px-[12px] py-[10px] text-left ' + (brand?.brand_kit_id === b.brand_kit_id ? 'border-ai bg-newBgColorInner' : 'border-newBorder hover:border-ai/50')}>
            <span className="text-[13px] font-[600] text-btnText truncate flex-1">{b.name}</span>
            <StatusPill b={b} />
          </button>
        ))}
        {error && <div className="text-[12px] text-red-400">{error}</div>}
      </div>

      {/* Editor */}
      <div className="flex-1 flex flex-col gap-[14px] min-w-0">
        {!brand ? (
          <div className={card + ' text-center text-[13px] text-textItemBlur py-[40px]'}>
            Select a brand, or <b className="text-btnText">+ New</b> to create one. A brand becomes usable in the
            Composer once it has all <b className="text-btnText">5 logos</b> (mark, wordmark, full-color / dark / light lockups).
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-[10px] flex-wrap">
              <span className="text-[18px] font-[700] text-btnText">{brand.name}</span>
              <StatusPill b={brand} />
              {busy && <span className="text-[11px] text-textItemBlur">Working…</span>}
              {!brand.builtin && <button type="button" onClick={doDelete}
                className="ml-auto h-[32px] px-[12px] rounded-[8px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[12px] font-[600] hover:bg-[#ff7eb6]/10">Delete brand</button>}
              {brand.builtin && <span className="ml-auto text-[11px] text-textItemBlur">Built-in (read-only)</span>}
            </div>

            {/* Brand preview */}
            <BrandPreview brand={brand} />

            {/* Completeness checklist */}
            <Completeness brand={brand} />

            {/* AI assist — fill the gaps */}
            {!brand.builtin && (
              <div className="flex items-center gap-[8px] flex-wrap">
                <span className="text-[12px] text-textItemBlur">Generate with AI:</span>
                {([['palette', 'Complete palette'], ['fonts', 'Suggest fonts'], ['voice', 'Draft voice']] as const).map(([k, label]) => (
                  <button key={k} type="button" disabled={!!assisting} onClick={() => runAssist(k)}
                    className="h-[30px] px-[12px] rounded-[8px] border border-ai/40 text-ai text-[12px] font-[600] hover:bg-ai/10 disabled:opacity-50">
                    {assisting === k ? '…' : `✨ ${label}`}
                  </button>
                ))}
                <button type="button" disabled={!!assisting} onClick={() => runAssist('logo')}
                  title="Generates a logo via image-gen — uses image credits"
                  className="h-[30px] px-[12px] rounded-[8px] border border-[#d82d7e]/50 text-ai text-[12px] font-[600] hover:bg-ai/10 disabled:opacity-50">
                  {assisting === 'logo' ? 'Generating…' : '✨ Generate logo ($)'}
                </button>
              </div>
            )}

            {/* Color palette */}
            <div className={card + ' flex flex-col gap-[10px]'}>
              <span className={sectionTitle}>Color palette — 4 (1 each) to start · 8 for a complete kit</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-[10px]">
                {PALETTE_CELLS.map((c) => {
                  const hex = swatchHex(c.role, c.shade);
                  return (
                    <label key={`${c.role}:${c.shade}`} className="flex flex-col gap-[5px] cursor-pointer">
                      <span className="relative block h-[54px] rounded-[8px] border border-newBorder overflow-hidden"
                        style={hex ? { background: hex } : undefined}>
                        {!hex && <span className="absolute inset-0 flex items-center justify-center text-[18px] text-textItemBlur border border-dashed border-newBorder rounded-[8px]">+</span>}
                        <input type="color" value={hex || '#888888'} disabled={brand.builtin}
                          onChange={(e) => setSwatch(c.role, c.shade, e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer" aria-label={c.label} />
                      </span>
                      <span className="text-[11px] text-textItemBlur flex items-center justify-between">
                        <span>{c.label}</span><span className="uppercase">{hex || ''}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Typography */}
            <div className={card + ' flex flex-col gap-[10px]'}>
              <span className={sectionTitle}>Typography — primary + secondary to start · accent for complete</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-[10px]">
                {FONT_ROLES.map((f) => {
                  const val = (brand.typography as any)?.[f.key] || '';
                  return (
                    <div key={f.key} className="flex flex-col gap-[6px]">
                      <span className="text-[12px] text-textItemBlur">{f.label} font</span>
                      <select className={ctrl} value={val} disabled={brand.builtin}
                        onChange={(e) => patch({ typography: { [f.key]: e.target.value || null } as any })} aria-label={`${f.label} font`}>
                        <option value="">— pick —</option>
                        {FONTS.map((fn) => <option key={fn} value={fn}>{fn}</option>)}
                      </select>
                      <span className="text-[18px] text-btnText truncate" style={val ? { fontFamily: `'${val}', sans-serif` } : undefined}>
                        {val ? 'The quick brown fox' : <span className="text-textItemBlur text-[12px]">no font</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Logos */}
            <div className={card + ' flex flex-col gap-[10px]'}>
              <span className={sectionTitle}>Logos — all 5 required to use this brand</span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-[10px]">
                {LOGO_SLOTS.map((slot) => {
                  const ref = (brand.logo as any)?.[slot];
                  const url = logoUrl(ref);
                  const dark = slot === 'lockupDark';
                  return (
                    <button key={slot} type="button" disabled={brand.builtin} onClick={() => pickLogo(slot)}
                      className="flex flex-col gap-[5px] text-left group">
                      <span className={'relative block h-[64px] rounded-[8px] border flex items-center justify-center overflow-hidden ' + (ref ? 'border-newBorder' : 'border-dashed border-newBorder') + (dark ? ' bg-[#0B1220]' : ' bg-newBgColorInner')}>
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={slot} className="max-h-[52px] max-w-[90%] object-contain" />
                        ) : ref ? <span className="text-[10px] text-textItemBlur uppercase">set</span>
                          : <span className="text-[18px] text-textItemBlur">+</span>}
                      </span>
                      <span className="text-[11px] text-textItemBlur">{LOGO_SLOT_LABELS[slot]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Brand voice */}
            <div className={card + ' flex flex-col gap-[8px]'}>
              <span className={sectionTitle}>Brand voice — optional for live · required for complete (drives email/ad copy)</span>
              <textarea defaultValue={brand.persona?.voice || ''} disabled={brand.builtin}
                onBlur={(e) => { if ((brand.persona?.voice || '') !== e.target.value) patch({ persona: { voice: e.target.value } }); }}
                placeholder="e.g. Confident, approachable, and data-driven — a mentor for active real-estate investors."
                className="min-h-[80px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText p-[10px] placeholder:text-textItemBlur" />
            </div>

            {/* Import — upload a brand asset; we extract colors/fonts/voice from it */}
            {!brand.builtin && (
              <div className={card + ' flex flex-col gap-[8px]'}>
                <span className={sectionTitle}>Import brand — upload a brand board, palette or logo; we'll extract colors, fonts & voice</span>
                <button type="button" onClick={() => setImportModal(true)} disabled={importing}
                  className="self-start h-[34px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] flex items-center gap-[6px] disabled:opacity-50">
                  {importing ? 'Extracting…' : '⬆ Import brand'}
                </button>
                <span className="text-[11px] text-textItemBlur">Colors/fonts/voice are filled in from the image; you still add the 5 logos to go live.</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Import modal — drag-drop / browse a brand asset, then extract */}
      {importModal && brand && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => !importing && setImportModal(false)}>
          <div className="w-[560px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-[8px]">
              <span className="text-[15px] font-[600] text-btnText flex-1">Import brand for {brand.name}</span>
              <button type="button" onClick={() => setImportModal(false)} className="h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText">✕</button>
            </div>
            <span className="text-[12px] text-textItemBlur">Drop a brand board, color palette, or logo image. We'll read the colors, fonts and voice and fill them in.{importing ? ' Extracting…' : ''}</span>
            <StudioDropZone accept="image" onUploaded={onImportUpload} />
          </div>
        </div>, document.body)}

      {/* Create modal */}
      {creating && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => !busy && setCreating(false)}>
          <div className="w-[420px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[14px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <span className="text-[15px] font-[600] text-btnText">New brand</span>
            <input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void doCreate(); } else if (e.key === 'Escape') setCreating(false); }}
              placeholder="Brand name" className={ctrl + ' w-full placeholder:text-textItemBlur'} aria-label="Brand name" />
            <div className="flex justify-end gap-[8px]">
              <button type="button" onClick={() => setCreating(false)} disabled={busy} className="h-[34px] px-[14px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600]">Cancel</button>
              <button type="button" onClick={doCreate} disabled={!newName.trim() || busy} className="h-[34px] px-[16px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[700] disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};

// Live brand preview — composes logo + palette + sample type.
const BrandPreview: FC<{ brand: Brand }> = ({ brand }) => {
  const sw = (role: ColorRole, shade: 'base' | 'alt' = 'base') => (brand.palette || []).find((s) => s.role === role && (s.shade || 'base') === shade)?.hex;
  const bg = sw('neutral', 'alt') || '#FFFFFF';
  const text = sw('neutral', 'base') || '#0B1220';
  const primary = sw('primary') || '#5279BC';
  const accent = sw('accent') || '#42B75E';
  const logo = logoUrl((brand.logo as any)?.lockupColor) || logoUrl((brand.logo as any)?.mark);
  const headline = (brand.typography as any)?.primary;
  const body = (brand.typography as any)?.secondary;
  return (
    <div className="rounded-[8px] border border-newBorder overflow-hidden">
      <div className="p-[20px] flex flex-col gap-[10px]" style={{ background: bg, color: text }}>
        <div className="flex items-center gap-[10px]">
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt="logo" className="h-[28px] object-contain" />
            : <span className="text-[16px] font-[700]" style={{ color: primary }}>{brand.name}</span>}
          <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: accent }}>preview</span>
        </div>
        <div className="text-[22px] font-[700]" style={{ fontFamily: headline ? `'${headline}', sans-serif` : undefined }}>Your headline, on brand.</div>
        <div className="text-[13px]" style={{ fontFamily: body ? `'${body}', sans-serif` : undefined, opacity: 0.85 }}>Body copy renders in your secondary font, on your neutral background.</div>
        <div className="flex gap-[8px] mt-[4px]">
          <span className="px-[12px] py-[6px] rounded-[6px] text-[12px] font-[600]" style={{ background: primary, color: bg }}>Primary CTA</span>
          <span className="px-[12px] py-[6px] rounded-[6px] text-[12px] font-[600]" style={{ background: accent, color: bg }}>Accent</span>
        </div>
      </div>
    </div>
  );
};

// Completeness checklist — the rubric gaps, by what they block.
const Completeness: FC<{ brand: Brand }> = ({ brand }) => {
  const gaps = brand.missing || [];
  const liveGaps = gaps.filter((g) => g.blocks === 'live');
  const completeGaps = gaps.filter((g) => g.blocks === 'complete');
  if (!gaps.length) return (
    <div className="rounded-[8px] border border-[#1db97a]/40 bg-[#1db97a]/5 px-[14px] py-[10px] text-[13px] text-[#1db97a]">
      ✓ This brand is complete.
    </div>
  );
  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColorInner px-[14px] py-[12px] flex flex-col gap-[6px]">
      {liveGaps.map((g, i) => <div key={`l${i}`} className="text-[13px] text-[#ff7eb6] flex items-start gap-[8px]"><span>●</span><span>{g.message}</span></div>)}
      {completeGaps.map((g, i) => <div key={`c${i}`} className="text-[12px] text-textItemBlur flex items-start gap-[8px]"><span>○</span><span>{g.message}</span></div>)}
    </div>
  );
};

export default StudioBrandPanel;
