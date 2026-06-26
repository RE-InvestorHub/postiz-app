'use client';

// Composer tab — the first Generate → Project → COMPOSE deliverable: a Still post.
// Bind the active Ad's images into the deliverable's SLOTS, lay headline / sub / CTA +
// data callouts + brand over it, and render one branded still PER channel. Brand comes
// from a swappable Brand Kit. Structure is reusable via a Template (Ad = Template + Brand
// Kit + Assets-in-slots): Save-as-template abstracts the current compose; Use a template
// to re-skin its structure with new assets + a new brand. Compose is the render action
// (magenta bg-ai); Save/Use/Add-to-ad are curation (purple bg-btnPrimary). Postiz tokens.

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, addObject, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  listBrandKits, listComposerChannels, composeStill, assetUrl,
  listTemplates, createTemplateFromStill, deleteTemplate,
  BrandKit, Channel, ComposeResult, DataCallout, ComposerTemplate, TemplateSlot,
} from '@gitroom/frontend/components/studio/studio.composer-client';
import { StudioSupersCanvas, SupersLayout, defaultLayout } from '@gitroom/frontend/components/studio/studio.supers-canvas';

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

// The implicit slot when no template is in use — a single hero image.
const DEFAULT_SLOTS: TemplateSlot[] = [{ key: 'hero', type: 'image', required: true }];

export const StudioComposerPanel: FC = () => {
  const { state, dispatch } = useStudio();

  const [images, setImages] = useState<ResolvedObject[]>([]);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [templates, setTemplates] = useState<ComposerTemplate[]>([]);

  // Brand kit lives in the store so the agent's compose.selectBrandKit reflects here.
  const brandKitId = state.composerBrandKitId || 'default';
  const setBrandKitId = (id: string) => dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: id });

  // Active template lives in the store so the agent's compose.useTemplate reflects here.
  const activeTemplateId = state.composerTemplateId || '';
  const setActiveTemplateId = (id: string) => dispatch({ type: 'SET_COMPOSER_TEMPLATE', templateId: id });
  const appliedTplRef = useRef<string>('');
  const [slotBindings, setSlotBindings] = useState<Record<string, string>>({});
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set(['ig_square']));
  const [headline, setHeadline] = useState('');
  const [sub, setSub] = useState('');
  const [cta, setCta] = useState('');
  const [data, setData] = useState<DataCallout[]>([]);
  const [positioning, setPositioning] = useState(false);
  const [layout, setLayout] = useState<SupersLayout | null>(null);

  const [saveName, setSaveName] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ComposeResult[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const activeTemplate = useMemo(
    () => templates.find((t) => t.template_id === activeTemplateId) || null,
    [templates, activeTemplateId],
  );
  const slots = activeTemplate?.slots?.length ? activeTemplate.slots : DEFAULT_SLOTS;

  const load = useCallback(async () => {
    if (!state.activeAdId) { setImages([]); return; }
    setError(null);
    try {
      const [objs, k, ch, tpls] = await Promise.all([
        getAdObjects(state.activeAdId), listBrandKits(), listComposerChannels(), listTemplates('still'),
      ]);
      const imgs = objs.filter((o) => o.type === 'image');
      setImages(imgs);
      setKits(k);
      setChannels(ch);
      setTemplates(tpls);
      // Default-bind the lone hero slot to the first image when nothing is bound yet.
      setSlotBindings((cur) => (Object.keys(cur).length || !imgs[0] ? cur : { hero: imgs[0].id }));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [state.activeAdId]);
  useEffect(() => { void load(); }, [load]);

  const bindSlot = (slotKey: string, imageId: string) =>
    setSlotBindings((b) => ({ ...b, [slotKey]: b[slotKey] === imageId ? '' : imageId }));

  const toggleChannel = (id: string) =>
    setSelectedChannels((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addCallout = () => setData((d) => [...d, { label: '', value: '' }]);
  const patchCallout = (i: number, patch: Partial<DataCallout>) =>
    setData((d) => d.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const removeCallout = (i: number) => setData((d) => d.filter((_, j) => j !== i));

  // Apply a template's structure: pre-fill copy + channels + reset bindings (the user
  // binds fresh assets for this use). Brand kit is left as-is — templates are brand-agnostic.
  const applyTemplate = useCallback((t: ComposerTemplate) => {
    setHeadline(t.copy?.headline ?? '');
    setSub(t.copy?.sub ?? '');
    setCta(t.copy?.cta ?? '');
    setData((t.copy?.dataLabels ?? []).map((d) => ({ label: d.label, value: '' })));
    setSelectedChannels(new Set(t.channels?.length ? t.channels : ['ig_square']));
    setSlotBindings({});               // explicit: bind fresh assets for this use
    setResults([]);
    // Restore the supers layout if the template carries one.
    if (t.layout?.elements?.length) { setLayout(t.layout); setPositioning(true); }
    else { setPositioning(false); }
  }, []);

  // Apply ONLY when the active template id actually transitions (UI dropdown or agent's
  // compose.useTemplate). Guarded by a ref so re-renders / template reloads don't clobber
  // edits, and so save-as-template (which pre-arms the ref) doesn't wipe the values it saved.
  useEffect(() => {
    if (activeTemplateId === appliedTplRef.current) return;
    const t = templates.find((x) => x.template_id === activeTemplateId);
    if (activeTemplateId && !t) return;   // id set but list not loaded yet — wait
    appliedTplRef.current = activeTemplateId;
    if (t) applyTemplate(t);              // '' (None) leaves the current fields untouched
  }, [activeTemplateId, templates, applyTemplate]);

  const saveAsTemplate = useCallback(async () => {
    if (!saveName.trim()) return;
    setSavingTpl(true); setError(null);
    try {
      const t = await createTemplateFromStill({
        name: saveName.trim(),
        copy: { headline, sub, cta, data },
        channels: Array.from(selectedChannels),
        ...(positioning && layout ? { layout } : {}),
      });
      setTemplates((cur) => [...cur, t]);
      appliedTplRef.current = t.template_id;   // pre-arm: don't re-apply (would wipe the values we just saved)
      setActiveTemplateId(t.template_id);
      setSaveName('');
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setSavingTpl(false); }
  }, [saveName, headline, sub, cta, data, selectedChannels, positioning, layout]);

  const removeTemplate = useCallback(async (id: string) => {
    try { await deleteTemplate(id); setTemplates((cur) => cur.filter((t) => t.template_id !== id)); if (activeTemplateId === id) setActiveTemplateId(''); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [activeTemplateId]);

  const requiredBound = slots.filter((s) => s.required).every((s) => slotBindings[s.key]);
  const heroRef = slotBindings[slots[0]?.key];
  // Supers drag-canvas inputs.
  const currentCopy = { headline, sub, cta, data };
  const heroPreviewUrl = heroRef ? srcUrl(images.find((o) => o.id === heroRef)?.record) : null;
  const firstChannel = channels.find((c) => selectedChannels.has(c.id)) || channels[0];
  const previewAspect = firstChannel ? firstChannel.w / firstChannel.h : 1;
  const activeRoles = kits.find((k) => k.brand_kit_id === brandKitId)?.roles || {};
  const canCompose = useMemo(
    () => !!heroRef && requiredBound && selectedChannels.size > 0 && (!!headline.trim() || data.some((c) => c.value.trim())) && !busy,
    [heroRef, requiredBound, selectedChannels, headline, data, busy],
  );

  const doCompose = useCallback(async () => {
    if (!heroRef || selectedChannels.size === 0) return;
    setBusy(true); setError(null); setResults([]); setAddedIds(new Set());
    try {
      const resp = await composeStill({
        imageRef: heroRef,
        adId: state.activeAdId ?? undefined,
        brandKitId,
        channels: Array.from(selectedChannels),
        templateId: activeTemplateId || undefined,
        slotBindings,
        ...(positioning && layout ? { layout } : {}),
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
  }, [heroRef, slotBindings, selectedChannels, brandKitId, activeTemplateId, headline, sub, cta, data, positioning, layout, state.activeAdId]);

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

        {/* Template bar — Use a saved structure, or save the current one */}
        <div className="flex flex-wrap items-end gap-[10px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
          <label className="flex flex-col gap-[4px]">
            <span className="text-[11px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Template</span>
            <select value={activeTemplateId} onChange={(e) => setActiveTemplateId(e.target.value)} className={inputCls}>
              <option value="">None — build from scratch</option>
              {templates.map((t) => (<option key={t.template_id} value={t.template_id}>{t.name}</option>))}
            </select>
          </label>
          {activeTemplate && (
            <button type="button" onClick={() => removeTemplate(activeTemplate.template_id)}
              className="h-[40px] px-[10px] text-[12px] text-[#ff7eb6] hover:underline">delete template</button>
          )}
          <div className="flex items-end gap-[6px] ml-auto">
            <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Name this template…" className={`${inputCls} w-[200px]`} />
            <button type="button" onClick={saveAsTemplate} disabled={!saveName.trim() || savingTpl}
              className="h-[40px] px-[14px] rounded-[8px] bg-btnPrimary text-white font-[600] text-[13px] disabled:opacity-50 flex items-center gap-[6px]"
              title="Save the current copy + channels as a reusable template">
              {savingTpl ? <><Spinner size={14} /> Saving…</> : 'Save as template'}
            </button>
          </div>
        </div>

        {/* Slot binder — bind the Ad's images into the deliverable's slots */}
        <div className="flex flex-col gap-[10px]">
          {slots.map((slot) => (
            <div key={slot.key} className="flex flex-col gap-[6px]">
              <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">
                Slot: <span className="text-btnText">{slot.key}</span>
                {slot.required && <span className="text-ai"> *</span>}
                <span className="ml-[6px] text-[11px] normal-case text-textItemBlur">({slot.type})</span>
              </span>
              <div className="grid grid-cols-3 minCustom:grid-cols-5 gap-[8px]">
                {images.map((o) => {
                  const u = srcUrl(o.record);
                  const sel = slotBindings[slot.key] === o.id;
                  return (
                    <button key={o.id} type="button" onClick={() => bindSlot(slot.key, o.id)}
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
          ))}
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

        {/* Position supers (drag canvas) — opt-in; overrides the default layout */}
        <div className="flex flex-col gap-[8px]">
          <label className="flex items-center gap-[8px] text-[12px] text-textItemBlur cursor-pointer">
            <input type="checkbox" checked={positioning} onChange={(e) => { setPositioning(e.target.checked); if (e.target.checked && !layout) setLayout(defaultLayout(currentCopy)); }} />
            Position supers (drag) — override the default layout
          </label>
          {positioning && (
            <StudioSupersCanvas imageUrl={heroPreviewUrl} aspect={previewAspect} copy={currentCopy} roles={activeRoles} layout={layout || defaultLayout(currentCopy)} onChange={setLayout} />
          )}
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
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 disabled:cursor-not-allowed ml-auto flex items-center gap-[8px]"
            title={requiredBound ? '' : 'Bind every required slot first'}>
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
