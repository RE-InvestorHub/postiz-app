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
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';
import { listCampaigns } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  Brand, ColorRole, LogoSlot, LOGO_SLOTS, LOGO_SLOT_LABELS,
  listBrands, getBrand, createBrand, updateBrand, addBrandFile, deleteBrand, extractBrandFromAsset, logoUrl,
  completeBrandPalette, suggestBrandFonts, draftBrandVoice, generateBrandLogos,
  GoogleFont, listGoogleFonts, ensureGoogleFont,
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
// Real file extension (png/jpg/jpeg/svg…) — uploads are stored as `${assetId}.${ext}`.
const extOf = (name: string) => (name.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1] || 'png').toLowerCase();

const StatusPill: FC<{ b: Brand }> = ({ b }) => {
  const map = { complete: ['Complete', 'text-[#1db97a] border-[#1db97a]/40'], live: ['Live', 'text-ai border-ai/40'], incomplete: ['Draft', 'text-[#ff7eb6] border-[#ff7eb6]/40'] } as const;
  const [label, cls] = map[b.tier] ?? map.incomplete;
  return <span className={`text-[10px] uppercase tracking-wide font-[700] px-[8px] py-[2px] rounded-full border ${cls}`}>{label}</span>;
};

// A 3- or 6-digit hex (with or without #).
const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const normHex = (v: string) => {
  let s = v.trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return '#' + s.toLowerCase();
};
// Pick legible text for a hex background (relative luminance).
const onColorFor = (hex?: string) => {
  if (!hex || !/^#?[0-9a-fA-F]{6}$/.test(hex)) return undefined;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0B1220' : '#FFFFFF';
};
// One palette cell: the hex value sits ON the colored swatch (auto-contrast); type/paste
// to edit it, or click the small chip to open the native picker. A pin toggle locks the
// color so "Complete palette" keeps it while re-rolling the unpinned ones.
const HexSwatch: FC<{ label: string; hex?: string; disabled?: boolean; pinned?: boolean; onCommit: (hex: string) => void; onPin?: (pinned: boolean) => void }> = ({ label, hex, disabled, pinned, onCommit, onPin }) => {
  const [val, setVal] = useState(hex || '');
  useEffect(() => { setVal(hex || ''); }, [hex]);
  const commit = () => {
    const t = val.trim();
    if (t && HEX_RE.test(t)) { if (normHex(t) !== (hex || '').toLowerCase()) onCommit(normHex(t)); }
    else setVal(hex || ''); // revert invalid / empty
  };
  const onColor = onColorFor(hex);
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="flex items-center gap-[6px]">
        <span className="flex-1 truncate text-[11px] text-textItemBlur">{label}</span>
        {hex && onPin && !disabled && (
          <button type="button" onClick={() => onPin(!pinned)}
            title={pinned ? 'Pinned — kept when you Complete palette' : 'Pin this color — keep it when you Complete palette'}
            className={'shrink-0 text-[10px] leading-none px-[5px] py-[2px] rounded-[4px] border ' + (pinned ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText')}>
            {pinned ? '📌 Pinned' : 'Pin'}
          </button>
        )}
      </span>
      <div className={'relative flex items-center h-[44px] rounded-[8px] border overflow-hidden ' + (hex ? 'border-newBorder' : 'border-dashed border-newBorder')}
        style={hex ? { background: hex } : undefined}>
        <input type="text" value={val} disabled={disabled} placeholder="#RRGGBB" spellCheck={false}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === 'Escape') { setVal(hex || ''); (e.target as HTMLInputElement).blur(); } }}
          style={onColor ? { color: onColor } : undefined}
          className="flex-1 min-w-0 bg-transparent px-[10px] text-[12px] font-[700] uppercase tracking-wide outline-none placeholder:text-textItemBlur placeholder:normal-case placeholder:font-[400] placeholder:tracking-normal disabled:opacity-60"
          aria-label={`${label} hex value`} />
        <input type="color" value={hex || '#888888'} disabled={disabled}
          onChange={(e) => onCommit(e.target.value)} title="Open the color picker"
          className="w-[26px] h-[26px] mr-[8px] shrink-0 rounded-[6px] border border-white/50 shadow-sm cursor-pointer bg-transparent disabled:cursor-default disabled:opacity-50"
          aria-label={`${label} color picker`} />
      </div>
    </div>
  );
};

const CTRL = 'h-[36px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText px-[10px]';
// One font row — renders its name in its own font, but only loads that font's CSS once it
// scrolls into the dropdown (lazy via IntersectionObserver) so a 1,900-font list is cheap.
const FontOption: FC<{ font: GoogleFont; selected: boolean; onPick: () => void }> = ({ font, selected, onPick }) => {
  const ref = useRef<HTMLButtonElement>(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const root = el.closest('[data-font-scroll]');
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { ensureGoogleFont(font.family); setShow(true); io.disconnect(); }
    }, { root, rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [font.family]);
  return (
    <button ref={ref} type="button" onClick={onPick} title={font.family}
      className={'w-full text-left px-[10px] py-[6px] text-[14px] hover:bg-newBgColorInner flex items-center gap-[8px] ' + (selected ? 'text-ai' : 'text-btnText')}
      style={show ? { fontFamily: `'${font.family}', sans-serif` } : undefined}>
      <span className="truncate flex-1">{font.family}</span>
      <span className="text-[10px] text-textItemBlur shrink-0 capitalize">{font.category}</span>
    </button>
  );
};
// Searchable font picker over the FULL Google Fonts list. Type to filter; every option
// previews in its own font (lazy-loaded on scroll). The chosen font loads for the previews.
const FontPicker: FC<{ value: string; fonts: GoogleFont[]; disabled?: boolean; ariaLabel: string; onChange: (family: string) => void }> = ({ value, fonts, disabled, ariaLabel, onChange }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setQ(''); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const ql = q.trim().toLowerCase();
  const filtered = ql ? fonts.filter((f) => f.family.toLowerCase().includes(ql)) : fonts;
  const pick = (family: string) => { if (family) ensureGoogleFont(family); onChange(family); setOpen(false); setQ(''); };
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}
        className={CTRL + ' w-full flex items-center gap-[6px] disabled:opacity-60'}>
        <span className={'truncate ' + (value ? 'text-btnText' : 'text-textItemBlur')} style={value ? { fontFamily: `'${value}', sans-serif` } : undefined}>{value || '— pick —'}</span>
        <span className="ml-auto text-textItemBlur text-[10px]">▾</span>
      </button>
      {open && (
        <div className="absolute z-[60] mt-[4px] w-full rounded-[8px] border border-newBorder bg-newBgColor shadow-xl overflow-hidden">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${fonts.length} fonts…`}
            className="w-full h-[34px] px-[10px] bg-newBgColorInner border-b border-newBorder text-[13px] text-btnText outline-none placeholder:text-textItemBlur" />
          <div data-font-scroll className="max-h-[260px] overflow-auto py-[4px]">
            <button type="button" onClick={() => pick('')} className="w-full text-left px-[10px] py-[6px] text-[12px] text-textItemBlur hover:bg-newBgColorInner">— none —</button>
            {filtered.length === 0 && <div className="px-[10px] py-[8px] text-[12px] text-textItemBlur">No matching fonts</div>}
            {filtered.map((f) => (
              <FontOption key={f.family} font={f} selected={f.family === value} onPick={() => pick(f.family)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  const [logoSlot, setLogoSlot] = useState<LogoSlot | null>(null); // which logo slot's add modal is open
  const [importModal, setImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  // Full Google Fonts list for the pickers (seeded with the curated set as a fallback).
  const [fonts, setFonts] = useState<GoogleFont[]>(() => FONTS.map((f) => ({ family: f, category: '' })));
  const [previewText, setPreviewText] = useState(''); // custom typography preview phrase
  // Two-step delete confirm: null = idle, number = # campaigns the cascade will remove.
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [saving, setSaving] = useState(false); // a field edit is being persisted

  const load = useCallback(async () => {
    try { setBrands(await listBrands()); } catch (e) { setError(msg(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // Fetch the full Google Fonts list once for the pickers.
  useEffect(() => { listGoogleFonts().then((f) => { if (f.length) setFonts(f); }).catch(() => {}); }, []);
  // Lazy-load the brand's selected fonts so every preview renders in them.
  useEffect(() => {
    const t = (brand?.typography || {}) as any;
    [t.primary, t.secondary, t.accent].forEach((f) => ensureGoogleFont(f));
  }, [brand?.typography]);

  // Open the active brand (or the first custom one) for editing on mount.
  useEffect(() => {
    const id = state.composerBrandKitId && state.composerBrandKitId !== 'default' ? state.composerBrandKitId : null;
    if (id) getBrand(id).then(setBrand).catch(() => {});
  }, [state.composerBrandKitId]);

  const select = async (id: string) => {
    setError(null); setConfirmDel(null);
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
    setSaving(true);
    try {
      const before = brand.status;
      const updated = await updateBrand(brand.brand_kit_id, p);
      setBrand(updated); await load();
      if (before !== 'live' && updated.status === 'live') toaster.show('This brand is now live — it can be used in the Composer.', 'success');
    } catch (e) { setError(msg(e)); } finally { setSaving(false); }
  };

  // Edits auto-persist as you go; Save flushes any focused field (its onBlur commits)
  // and confirms — so a user knows the brand is stored before moving on.
  const onSave = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    toaster.show('Brand saved — all changes are stored.', 'success');
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

  const swatchAt = (role: ColorRole, shade: 'base' | 'alt') =>
    (brand?.palette || []).find((s) => s.role === role && (s.shade || 'base') === shade);
  const setSwatch = (role: ColorRole, shade: 'base' | 'alt', hex: string) => {
    if (!brand) return;
    const others = (brand.palette || []).filter((s) => !(s.role === role && (s.shade || 'base') === shade));
    const label = PALETTE_CELLS.find((c) => c.role === role && c.shade === shade)?.label;
    const prev = swatchAt(role, shade);
    void patch({ palette: [...others, { role, shade, hex, name: label, ...(prev?.pinned ? { pinned: true } : {}) }] });
  };
  const setPinned = (role: ColorRole, shade: 'base' | 'alt', pinned: boolean) => {
    if (!brand) return;
    const next = (brand.palette || []).map((s) => (s.role === role && (s.shade || 'base') === shade) ? { ...s, pinned } : s);
    void patch({ palette: next });
  };
  const swatchHex = (role: ColorRole, shade: 'base' | 'alt') => swatchAt(role, shade)?.hex;
  const swatchPinned = (role: ColorRole, shade: 'base' | 'alt') => !!swatchAt(role, shade)?.pinned;

  // Clicking any logo "+" opens a modal: upload (left) or generate with AI (right).
  const pickLogo = (slot: LogoSlot) => setLogoSlot(slot);
  // Left card: an uploaded image (png/jpg/svg) → set this slot to it.
  const onLogoUploaded = async (asset: UploadedAsset) => {
    const slot = logoSlot;
    if (!slot || !brand) return;
    setBusy(true); setError(null);
    try {
      const before = brand.status;
      const updated = await addBrandFile(brand.brand_kit_id, { slot, assetId: asset.assetId, kind: extOf(asset.filename) });
      setBrand(updated); await load();
      setLogoSlot(null);
      if (before !== 'live' && updated.status === 'live') toaster.show('All 5 logos set — this brand is now live!', 'success');
      else toaster.show(`${LOGO_SLOT_LABELS[slot]} set.`, 'success');
    } catch (err) { setError(msg(err)); } finally { setBusy(false); }
  };
  // Right card: open the draggable agent chat, seeded for this logo slot. The agent gets
  // the brand's colors/fonts/filled-slots context server-side (via the active brandKitId).
  const onLogoAI = () => {
    const slot = logoSlot;
    setLogoSlot(null);
    dispatch({ type: 'OPEN_FLOATING_AGENT', seed: `Help me create the ${slot ? LOGO_SLOT_LABELS[slot] : 'logo'} for my brand “${brand?.name ?? ''}”. Use my existing brand colors and fill the empty logo slots.` });
  };

  // Step 1: arm the confirm, fetching how many campaigns the cascade will remove.
  const startDelete = async () => {
    if (!brand) return;
    let n = 0;
    try { n = (await listCampaigns(brand.brand_kit_id)).length; } catch { /* count is advisory */ }
    setConfirmDel(n);
  };
  // Step 2: cascade-delete the brand (brain removes its campaigns + ads), then refresh.
  const doDelete = async () => {
    if (!brand) return;
    setBusy(true);
    try {
      await deleteBrand(brand.brand_kit_id);
      if (state.composerBrandKitId === brand.brand_kit_id) dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: 'default' });
      toaster.show(`Deleted “${brand.name}” and its campaigns.`, 'success');
      setConfirmDel(null); setBrand(null); await load();
    }
    catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  // ---- styles ----
  const card = 'rounded-[8px] border border-newBorder bg-newBgColor p-[16px]';
  const ctrl = 'h-[36px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText px-[10px]';
  const sectionTitle = 'text-[12px] font-[600] text-textItemBlur uppercase tracking-wide';

  return (
    <div className="flex flex-col md:flex-row gap-[14px]">
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
              {!brand.builtin && !busy && (saving
                ? <span className="text-[11px] text-textItemBlur">Saving…</span>
                : <span className="text-[11px] text-[#1db97a]">✓ Saved</span>)}
              <div className="ml-auto flex items-center gap-[8px] flex-wrap">
                {!brand.builtin && confirmDel === null && (
                  <button type="button" onClick={onSave} disabled={saving}
                    title="Your edits save automatically; click to confirm everything is stored."
                    className="h-[32px] px-[14px] rounded-[8px] bg-[#1db97a] text-[#06281c] text-[12px] font-[700] hover:opacity-90 disabled:opacity-50">
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
                {!brand.builtin && confirmDel === null && (
                  <button type="button" onClick={() => setImportModal(true)} disabled={importing}
                    title="Upload a brand board, palette, or logo image — we'll extract the colors, fonts & brand voice from it. You still add the 5 logos to make the brand live."
                    className="h-[32px] px-[12px] rounded-[8px] border border-ai/40 text-ai text-[12px] font-[600] hover:bg-ai/10 disabled:opacity-50">
                    {importing ? 'Extracting…' : '⬆ Import brand'}
                  </button>
                )}
                {confirmDel === null ? (
                  <button type="button" onClick={startDelete} disabled={busy}
                    className="h-[32px] px-[12px] rounded-[8px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[12px] font-[600] hover:bg-[#ff7eb6]/10 disabled:opacity-50">Delete brand</button>
                ) : (
                  <span className="flex items-center gap-[8px] flex-wrap">
                    <span className="text-[12px] text-[#ff7eb6]">
                      Delete <b>{brand.name}</b>{confirmDel > 0 ? <> and its {confirmDel} {confirmDel === 1 ? 'campaign' : 'campaigns'} (+ their ads)</> : null}? Library media is kept.
                    </span>
                    <button type="button" onClick={doDelete} disabled={busy}
                      className="h-[30px] px-[12px] rounded-[8px] bg-[#ff7eb6] text-[#1a0a12] text-[12px] font-[700] hover:opacity-90 disabled:opacity-50">{busy ? 'Deleting…' : 'Delete'}</button>
                    <button type="button" onClick={() => setConfirmDel(null)} disabled={busy}
                      className="h-[30px] px-[12px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600] hover:border-ai/50 disabled:opacity-50">Cancel</button>
                  </span>
                )}
              </div>
            </div>

            {/* Brand preview */}
            <BrandPreview brand={brand} />

            {/* Completeness checklist */}
            <Completeness brand={brand} />

            {/* AI assist — fill the gaps */}
            {!brand.builtin && (
              <div className="flex items-center gap-[8px] flex-wrap">
                <span className="text-[12px] text-textItemBlur">Generate with AI:</span>
                {([
                  ['palette', 'Complete palette', 'Generate a full 8-color palette. Pinned colors are kept; click again to re-roll the rest.'],
                  ['fonts', 'Suggest fonts', 'Suggest a font pairing. Click again for a different pairing.'],
                  ['voice', 'Draft voice', 'Draft a brand voice. Click again for a different take.'],
                ] as const).map(([k, label, tip]) => (
                  <button key={k} type="button" disabled={!!assisting} onClick={() => runAssist(k)} title={tip}
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

            {/* Color palette + Typography + Logos — three columns */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[14px] items-start">
              {/* Color palette */}
              <div className={card + ' flex flex-col gap-[10px]'}>
                <span className={sectionTitle}>Color palette — 4 (1 each) to start · 8 for a complete kit</span>
                <div className="grid grid-cols-2 gap-[10px]">
                  {PALETTE_CELLS.map((c) => (
                    <HexSwatch key={`${c.role}:${c.shade}`} label={c.label} hex={swatchHex(c.role, c.shade)}
                      disabled={brand.builtin} pinned={swatchPinned(c.role, c.shade)}
                      onCommit={(hex) => setSwatch(c.role, c.shade, hex)} onPin={(p) => setPinned(c.role, c.shade, p)} />
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className={card + ' flex flex-col gap-[10px]'}>
                <span className={sectionTitle}>Typography — primary + secondary to start · accent for complete</span>
                <input value={previewText} disabled={brand.builtin} onChange={(e) => setPreviewText(e.target.value)}
                  placeholder="Preview text (e.g. your tagline)…" aria-label="Typography preview text"
                  className={ctrl + ' w-full placeholder:text-textItemBlur'} />
                <div className="grid grid-cols-1 gap-[10px]">
                  {FONT_ROLES.map((f) => {
                    const val = (brand.typography as any)?.[f.key] || '';
                    return (
                      <div key={f.key} className="flex flex-col gap-[6px]">
                        <span className="text-[12px] text-textItemBlur">{f.label} font</span>
                        <FontPicker value={val} fonts={fonts} disabled={brand.builtin} ariaLabel={`${f.label} font`}
                          onChange={(family) => patch({ typography: { [f.key]: family || null } as any })} />
                        <span className="text-[18px] text-btnText truncate" style={val ? { fontFamily: `'${val}', sans-serif` } : undefined}>
                          {val ? (previewText.trim() || 'The quick brown fox') : <span className="text-textItemBlur text-[12px]">no font</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Logos */}
              <div className={card + ' flex flex-col gap-[10px]'}>
                <span className={sectionTitle}>Logos — all 5 required to use this brand</span>
                <div className="grid grid-cols-1 gap-[10px]">
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
            </div>

            {/* Brand voice */}
            <div className={card + ' flex flex-col gap-[8px]'}>
              <span className={sectionTitle}>Brand voice — optional for live · required for complete (drives email/ad copy)</span>
              <textarea defaultValue={brand.persona?.voice || ''} disabled={brand.builtin}
                onBlur={(e) => { if ((brand.persona?.voice || '') !== e.target.value) patch({ persona: { voice: e.target.value } }); }}
                placeholder="e.g. Confident, approachable, and data-driven — a mentor for active real-estate investors."
                className="min-h-[80px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText p-[10px] placeholder:text-textItemBlur" />
            </div>

          </>
        )}
      </div>

      {/* Import modal — drag-drop / browse a brand asset, then extract */}
      {/* Add-logo modal: upload (left) or generate with AI (right) */}
      {logoSlot && brand && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => !busy && !assisting && setLogoSlot(null)}>
          <div className="w-[680px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[14px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-[8px]">
              <span className="text-[15px] font-[700] text-btnText flex-1">Add {LOGO_SLOT_LABELS[logoSlot]}</span>
              <button type="button" onClick={() => setLogoSlot(null)} className="h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText">✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[14px] items-stretch">
              {/* Left — upload */}
              <div className="rounded-[8px] border border-newBorder p-[14px] flex flex-col gap-[10px]">
                <span className="text-[13px] font-[700] text-btnText">Upload an image</span>
                <span className="text-[11px] text-textItemBlur">Drag &amp; drop or browse — PNG, JPG, or SVG.</span>
                <StudioDropZone accept="image" onUploaded={onLogoUploaded} />
              </div>
              {/* Right — AI */}
              <div className="rounded-[8px] border border-ai/40 bg-ai/5 p-[14px] flex flex-col gap-[10px]">
                <span className="text-[13px] font-[700] text-ai">✨ Use AI</span>
                <span className="text-[11px] text-textItemBlur flex-1">Generate a logo from your brand name and colors, then apply it to the logo set. Uses image credits.</span>
                <button type="button" onClick={onLogoAI} disabled={!!assisting}
                  className="h-[38px] rounded-[8px] bg-ai text-white text-[13px] font-[700] hover:opacity-90 disabled:opacity-50">
                  {assisting === 'logo' ? 'Generating…' : 'Generate with AI'}
                </button>
              </div>
            </div>
          </div>
        </div>, document.body)}

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

// Live brand preview — composes logo + palette + sample type, with a Light/Dark toggle
// that swaps the neutral surface/text and the mode-appropriate logo lockup.
const BrandPreview: FC<{ brand: Brand }> = ({ brand }) => {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const sw = (role: ColorRole, shade: 'base' | 'alt' = 'base') => (brand.palette || []).find((s) => s.role === role && (s.shade || 'base') === shade)?.hex;
  const primary = sw('primary') || '#5279BC';
  const accent = sw('accent') || '#42B75E';
  const headline = (brand.typography as any)?.primary;
  const body = (brand.typography as any)?.secondary;
  const dark = mode === 'dark';
  // neutral base = dark shade, neutral alt = light shade.
  const surface = dark ? (sw('neutral', 'base') || '#0B1220') : (sw('neutral', 'alt') || '#F4F7FB');
  const text = dark ? (sw('neutral', 'alt') || '#F4F7FB') : (sw('neutral', 'base') || '#0B1220');
  const lg = (brand.logo || {}) as any;
  const logo = dark
    ? (logoUrl(lg.lockupDark) || logoUrl(lg.mark) || logoUrl(lg.lockupColor))
    : (logoUrl(lg.lockupLight) || logoUrl(lg.lockupColor) || logoUrl(lg.wordmark) || logoUrl(lg.mark));
  const seg = (m: 'light' | 'dark', label: string) => (
    <button type="button" onClick={() => setMode(m)}
      className={'px-[10px] py-[3px] text-[11px] font-[600] ' + (mode === m ? 'bg-ai text-white' : 'text-textItemBlur hover:text-btnText')}>{label}</button>
  );
  return (
    <div className="rounded-[8px] border border-newBorder overflow-hidden">
      <div className="flex items-center justify-between px-[12px] py-[6px] bg-newBgColorInner border-b border-newBorder">
        <span className="text-[10px] uppercase tracking-wide text-textItemBlur">Preview</span>
        <div className="flex rounded-[6px] border border-newBorder overflow-hidden">{seg('light', '☀ Light')}{seg('dark', '🌙 Dark')}</div>
      </div>
      <div className="p-[20px] flex flex-col gap-[10px]" style={{ background: surface, color: text }}>
        <div className="flex items-center gap-[10px]">
          {logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logo} alt="logo" className="h-[28px] object-contain" />
            : <span className="text-[16px] font-[700]" style={{ color: primary }}>{brand.name}</span>}
          <span className="ml-auto text-[10px] uppercase tracking-wide" style={{ color: accent }}>{dark ? 'dark mode' : 'light mode'}</span>
        </div>
        <div className="text-[22px] font-[700]" style={{ fontFamily: headline ? `'${headline}', sans-serif` : undefined }}>Your headline, on brand.</div>
        <div className="text-[13px]" style={{ fontFamily: body ? `'${body}', sans-serif` : undefined, opacity: 0.85 }}>Body copy renders in your secondary font, on your neutral background.</div>
        <div className="flex gap-[8px] mt-[4px]">
          <span className="px-[12px] py-[6px] rounded-[6px] text-[12px] font-[600]" style={{ background: primary, color: onColorFor(primary) }}>Primary CTA</span>
          <span className="px-[12px] py-[6px] rounded-[6px] text-[12px] font-[600]" style={{ background: accent, color: onColorFor(accent) }}>Accent</span>
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
