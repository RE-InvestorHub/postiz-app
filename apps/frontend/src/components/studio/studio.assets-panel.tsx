'use client';

// Assets tab — a breadcrumb-driven file manager over Campaigns › Ads › assets.
//
// Replaces the old "Project" tab (which only ever showed the one ACTIVE ad). A real
// management surface: browse every campaign, drill into its ads, and see the assets
// each ad references. File-manager toolbar (search · sort · list/grid · add files ·
// select-all) modeled on the 21st.dev file-upload reference, re-skinned to Postiz
// tokens. Destructive actions live on the node they affect, single OR in bulk, and
// cascade correctly:
//   • delete campaign(s) → cascades to their ads (backend)
//   • delete ad(s)       → de-links from the campaign (campaign + siblings survive)
//   • remove asset(s)    → unlinks the reference only (project-agnostic asset survives)
// Every delete is confirm-gated.
//
// Navigation: the bar and the breadcrumb are two views of one selection. Picking a
// Campaign/Ad in the bar "zooms" the breadcrumb to it; clicking down a row sets the
// bar's active selection (two-way). Clicking a breadcrumb crumb navigates up freely.

import { ChangeEvent, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import {
  listCampaigns, listAds, getAdObjects, addObject, removeObject,
  createCampaign, createAd, deleteCampaign, deleteAd,
  Campaign, Ad, ResolvedObject, ObjectType,
} from '@gitroom/frontend/components/studio/studio.project-client';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';

function thumbUrl(rec: any): string | null {
  if (!rec) return null;
  if (rec.path) return `${BRAIN_BASE.replace(/\/+$/, '')}/assets/${rec.path}`;
  if (rec.cdnUrl) return rec.cdnUrl;
  return null;
}
const absUrl = (u: string) => { try { return new URL(u, window.location.origin).href; } catch { return u; } };

const kindToType = (k: UploadedAsset['kind']): ObjectType =>
  k === 'video' ? 'clip' : k === 'audio' ? 'audio' : 'image';

const msg = (e: unknown) => (e as Error)?.message ?? String(e);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------------------
// Inline icons (Lucide-style, currentColor)
// ---------------------------------------------------------------------------
const svg = (d: React.ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const IconChevron: FC = () => svg(<polyline points="9 18 15 12 9 6" />, 14);
const IconFolder: FC = () => svg(<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />);
const IconAd: FC = () => svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></>);
const IconTrash: FC = () => svg(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14);
const IconImg: FC = () => svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>, 14);
const IconAudio: FC = () => svg(<><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /></>, 14);
const IconSearch: FC = () => svg(<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>, 14);
const IconList: FC = () => svg(<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>, 14);
const IconGrid: FC = () => svg(<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /></>, 14);
const IconArrow: FC = () => svg(<><path d="m3 16 4 4 4-4" /><path d="M7 20V4" /></>, 14);
const IconOpen: FC = () => svg(<><path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>, 13);
const IconDownload: FC = () => svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>, 13);
const IconLink: FC = () => svg(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 13);
const IconPlus: FC = () => svg(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 14);

// ---------------------------------------------------------------------------
// A pending delete request — single or bulk, unified.
// ---------------------------------------------------------------------------
type DeleteReq =
  | { kind: 'campaign'; items: { id: string; name: string; adCount: number }[] }
  | { kind: 'ad'; items: { id: string; name: string; assetCount: number }[] }
  | { kind: 'asset'; adId: string; items: { id: string; name: string; type: ObjectType }[] };

type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const StudioAssetsPanel: FC = () => {
  const { state, dispatch } = useStudio();

  // Local breadcrumb view — independent of the bar so "up" navigation is free.
  const [viewCampaignId, setViewCampaignId] = useState<string | null>(state.activeCampaignId);
  const [viewAdId, setViewAdId] = useState<string | null>(state.activeAdId);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [objects, setObjects] = useState<ResolvedObject[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<DeleteReq | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Toolbar state
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'meta'>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [createKind, setCreateKind] = useState<'campaign' | 'ad' | null>(null); // open modal
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const level: 'campaigns' | 'campaign' | 'ad' = viewAdId ? 'ad' : viewCampaignId ? 'campaign' : 'campaigns';
  const viewCampaign = campaigns.find((c) => c.campaign_id === viewCampaignId) ?? null;
  const viewAd = ads.find((a) => a.ad_id === viewAdId) ?? null;

  // ---- loaders ----
  const loadCampaigns = useCallback(async () => {
    try { setCampaigns(await listCampaigns()); } catch (e) { setError(msg(e)); }
  }, []);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (!viewCampaignId) { setAds([]); return; }
    let live = true; setBusy(true);
    listAds(viewCampaignId)
      .then((a) => { if (live) setAds(a); })
      .catch((e) => { if (live) setError(msg(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [viewCampaignId, state.activeAdId]);

  useEffect(() => {
    if (!viewAdId) { setObjects([]); return; }
    let live = true; setBusy(true);
    getAdObjects(viewAdId)
      .then((o) => { if (live) setObjects(o); })
      .catch((e) => { if (live) setError(msg(e)); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, [viewAdId]);

  // ---- bar → breadcrumb (zoom to the bar's selection whenever it changes) ----
  useEffect(() => {
    setViewCampaignId(state.activeCampaignId);
    setViewAdId(state.activeAdId);
    void loadCampaigns();
  }, [state.activeCampaignId, state.activeAdId, loadCampaigns]);

  // Reset selection + search + any open create-modal whenever the level/view changes.
  useEffect(() => { setSelected(new Set()); setQuery(''); setCreateKind(null); setNewName(''); }, [level, viewCampaignId, viewAdId]);

  // ---- navigation ----
  const openCampaign = (id: string) => { setViewAdId(null); setViewCampaignId(id); dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: id }); };
  const openAd = (id: string) => { setViewAdId(id); dispatch({ type: 'SET_ACTIVE_AD', adId: id }); };
  const crumbToRoot = () => { setViewAdId(null); setViewCampaignId(null); };
  const crumbToCampaign = () => { setViewAdId(null); };

  // ---- filtered + sorted display lists ----
  const q = query.trim().toLowerCase();
  const dir = sortDir === 'asc' ? 1 : -1;
  const cmp = (a: string | number, b: string | number) =>
    (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * dir;

  const displayCampaigns = useMemo(() => campaigns
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => cmp(sortKey === 'name' ? a.name : a.ad_ids.length, sortKey === 'name' ? b.name : b.ad_ids.length)),
    [campaigns, q, sortKey, dir]);
  const displayAds = useMemo(() => ads
    .filter((a) => !q || a.name.toLowerCase().includes(q))
    .sort((a, b) => cmp(sortKey === 'name' ? a.name : a.objects.length, sortKey === 'name' ? b.name : b.objects.length)),
    [ads, q, sortKey, dir]);
  const displayObjects = useMemo(() => objects
    .filter((o) => !q || `${o.id} ${o.type}`.toLowerCase().includes(q))
    .sort((a, b) => cmp(sortKey === 'name' ? a.id : a.type, sortKey === 'name' ? b.id : b.type)),
    [objects, q, sortKey, dir]);

  const rowIds = level === 'campaigns' ? displayCampaigns.map((c) => c.campaign_id)
    : level === 'campaign' ? displayAds.map((a) => a.ad_id)
      : displayObjects.map((o) => o.id);
  const totalCount = level === 'campaigns' ? campaigns.length : level === 'campaign' ? ads.length : objects.length;
  const metaLabel = level === 'campaigns' ? 'Ads' : level === 'campaign' ? 'Assets' : 'Type';

  // ---- selection ----
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rowIds));

  // ---- ask to delete ----
  const askDeleteCampaigns = (ids: string[]) => {
    const items = campaigns.filter((c) => ids.includes(c.campaign_id)).map((c) => ({ id: c.campaign_id, name: c.name, adCount: c.ad_ids.length }));
    if (items.length) setPending({ kind: 'campaign', items });
  };
  const askDeleteAds = (ids: string[]) => {
    const items = ads.filter((a) => ids.includes(a.ad_id)).map((a) => ({ id: a.ad_id, name: a.name, assetCount: a.objects.length }));
    if (items.length) setPending({ kind: 'ad', items });
  };
  const askRemoveAssets = (ids: string[]) => {
    if (!viewAdId) return;
    const items = objects.filter((o) => ids.includes(o.id)).map((o) => ({ id: o.id, name: `${o.type} · ${o.id}`, type: o.type }));
    if (items.length) setPending({ kind: 'asset', adId: viewAdId, items });
  };
  const askDeleteSelection = () => {
    const ids = [...selected];
    if (level === 'campaigns') askDeleteCampaigns(ids);
    else if (level === 'campaign') askDeleteAds(ids);
    else askRemoveAssets(ids);
  };

  // ---- execute the pending delete ----
  const confirmDelete = async () => {
    if (!pending) return;
    setBusy(true); setError(null);
    try {
      if (pending.kind === 'campaign') {
        for (const it of pending.items) await deleteCampaign(it.id);
        const ids = pending.items.map((i) => i.id);
        if (state.activeCampaignId && ids.includes(state.activeCampaignId)) dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: null });
        if (viewCampaignId && ids.includes(viewCampaignId)) { setViewCampaignId(null); setViewAdId(null); }
        await loadCampaigns();
      } else if (pending.kind === 'ad') {
        for (const it of pending.items) await deleteAd(it.id);
        const ids = pending.items.map((i) => i.id);
        if (state.activeAdId && ids.includes(state.activeAdId)) dispatch({ type: 'SET_ACTIVE_AD', adId: null });
        if (viewAdId && ids.includes(viewAdId)) setViewAdId(null);
        if (viewCampaignId) setAds(await listAds(viewCampaignId));
        await loadCampaigns();
      } else {
        for (const it of pending.items) await removeObject({ adId: pending.adId, type: it.type, id: it.id });
        if (viewAdId) setObjects(await getAdObjects(viewAdId));
      }
      setSelected(new Set());
      setPending(null);
    } catch (e) { setError(msg(e)); } finally { setBusy(false); }
  };

  // ---- create modal: open a "+ Campaign" / "+ Ad" naming dialog, then create ----
  const openCreate = (kind: 'campaign' | 'ad') => { setNewName(''); setError(null); setCreateKind(kind); };
  const submitCreate = async () => {
    const name = newName.trim();
    if (!name || creating || !createKind) return;
    setCreating(true); setError(null);
    try {
      if (createKind === 'campaign') {
        await createCampaign({ name });
        await loadCampaigns();
      } else if (createKind === 'ad' && viewCampaignId) {
        await createAd({ campaignId: viewCampaignId, name });
        setAds(await listAds(viewCampaignId));
        await loadCampaigns(); // refresh the campaign's ad count at root
      }
      setNewName('');
      setCreateKind(null);
    } catch (e) { setError(msg(e)); } finally { setCreating(false); }
  };

  // ---- uploads: drop zone callback + "Add files" picker (both link to the active ad) ----
  const linkUpload = useCallback(async (asset: UploadedAsset) => {
    if (!viewAdId) return;
    try {
      await addObject({ adId: viewAdId, type: kindToType(asset.kind), id: asset.assetId });
      setObjects(await getAdObjects(viewAdId));
    } catch (e) { setError(msg(e)); }
  }, [viewAdId]);

  const onPickFiles = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length || !viewAdId) return;
    setBusy(true); setError(null);
    try {
      for (const f of Array.from(files)) {
        const asset = await uploadFileToBrain(f, () => {});
        dispatch({ type: 'ADD_UPLOAD', asset });
        await addObject({ adId: viewAdId, type: kindToType(asset.kind), id: asset.assetId });
      }
      setObjects(await getAdObjects(viewAdId));
    } catch (err) { setError(msg(err)); } finally { setBusy(false); e.target.value = ''; }
  }, [viewAdId, dispatch]);

  // ---- asset quick actions ----
  const openAsset = (url: string | null) => { if (url) window.open(absUrl(url), '_blank', 'noopener'); };
  const downloadAsset = (url: string | null, name: string) => { if (!url) return; const a = document.createElement('a'); a.href = absUrl(url); a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
  const copyLink = (url: string | null) => { if (url) navigator.clipboard?.writeText(absUrl(url)).catch(() => {}); };

  // ---- styles ----
  const trashBtn = 'shrink-0 h-[30px] w-[30px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-[#ff7eb6] hover:bg-[#ff7eb6]/10 transition-colors';
  const iconBtn = 'shrink-0 h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText hover:bg-newBgColor transition-colors';
  const crumbBtn = 'text-[13px] font-[600] text-textItemBlur hover:text-btnText transition-colors';
  const dangerBtn = 'h-[32px] px-[12px] rounded-[8px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[12px] font-[600] hover:bg-[#ff7eb6]/10 disabled:opacity-40';
  // Identical shape to dangerBtn, hollow + green (mirrors the hollow + red delete button).
  const addBtn = 'h-[32px] px-[12px] rounded-[8px] border border-[#1db97a]/40 text-[#1db97a] text-[12px] font-[600] hover:bg-[#1db97a]/10 disabled:opacity-40';
  const ctrlCls = 'h-[34px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText';
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const Checkbox: FC<{ id: string; label: string }> = ({ id, label }) => (
    <input type="checkbox" className="accent-[#d82d7e] w-[15px] h-[15px] shrink-0" checked={selected.has(id)} onChange={() => toggle(id)} onClick={stop} aria-label={label} />
  );

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[14px]">
      {/* Header: breadcrumb + count + container delete */}
      <div className="flex items-center gap-[8px] flex-wrap">
        <button type="button" onClick={crumbToRoot} className={level === 'campaigns' ? 'text-[13px] font-[600] text-btnText' : crumbBtn}>Campaigns</button>
        {viewCampaign && (<><span className="text-textItemBlur"><IconChevron /></span>
          <button type="button" onClick={crumbToCampaign} className={level === 'campaign' ? 'text-[13px] font-[600] text-btnText' : crumbBtn}>{viewCampaign.name}</button></>)}
        {viewAd && (<><span className="text-textItemBlur"><IconChevron /></span>
          <span className="text-[13px] font-[600] text-btnText">{viewAd.name}</span></>)}
        <span className="text-[12px] text-textItemBlur">({totalCount})</span>
        <span className="ml-auto flex items-center gap-[8px]">
          {busy && <span className="text-[11px] text-textItemBlur">Working…</span>}
          {/* Root: create a campaign. */}
          {level === 'campaigns' && (<button type="button" className={addBtn} onClick={() => openCreate('campaign')}>+ Campaign</button>)}
          {/* Inside a campaign: "+ Ad" sits immediately left of "Delete campaign". */}
          {level === 'campaign' && viewCampaign && (<>
            <button type="button" className={addBtn} onClick={() => openCreate('ad')}>+ Ad</button>
            <button type="button" className={dangerBtn} onClick={() => askDeleteCampaigns([viewCampaign.campaign_id])}>Delete campaign</button>
          </>)}
          {level === 'ad' && viewAd && (<button type="button" className={dangerBtn} onClick={() => askDeleteAds([viewAd.ad_id])}>Delete ad</button>)}
        </span>
      </div>

      {/* Toolbar: search · sort · view · add files */}
      {totalCount > 0 && (
        <div className="flex items-center gap-[10px] flex-wrap">
          <div className="relative">
            <span className="absolute left-[10px] top-1/2 -translate-y-1/2 text-textItemBlur"><IconSearch /></span>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or type…"
              className={ctrlCls + ' pl-[30px] pr-[10px] w-[220px] placeholder:text-textItemBlur'} aria-label="Search" />
          </div>
          <label className="flex items-center gap-[6px] text-[12px] text-textItemBlur">
            Sort
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as 'name' | 'meta')} className={ctrlCls + ' px-[8px]'} aria-label="Sort by">
              <option value="name">Name</option>
              <option value="meta">{metaLabel}</option>
            </select>
          </label>
          <button type="button" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className={ctrlCls + ' w-[34px] flex items-center justify-center ' + (sortDir === 'desc' ? 'rotate-180' : '')} aria-label="Toggle sort direction"><IconArrow /></button>
          <div className="flex items-center rounded-[8px] border border-newBorder overflow-hidden">
            <button type="button" onClick={() => setView('list')} aria-label="List view" aria-pressed={view === 'list'}
              className={'h-[34px] w-[34px] flex items-center justify-center ' + (view === 'list' ? 'bg-ai text-newBgColor' : 'text-textItemBlur hover:text-btnText')}><IconList /></button>
            <button type="button" onClick={() => setView('grid')} aria-label="Grid view" aria-pressed={view === 'grid'}
              className={'h-[34px] w-[34px] flex items-center justify-center ' + (view === 'grid' ? 'bg-ai text-newBgColor' : 'text-textItemBlur hover:text-btnText')}><IconGrid /></button>
          </div>
          {level === 'ad' && (
            <button type="button" onClick={() => fileRef.current?.click()}
              className="ml-auto h-[34px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] flex items-center gap-[6px]"><IconPlus /> Add files</button>
          )}
          <input ref={fileRef} type="file" multiple className="sr-only" aria-hidden="true" onChange={onPickFiles} />
        </div>
      )}

      {/* Bulk action bar */}
      {rowIds.length > 0 && (
        <div className="flex items-center gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner px-[12px] py-[8px]">
          <label className="flex items-center gap-[8px] cursor-pointer select-none">
            <input type="checkbox" className="accent-[#d82d7e] w-[15px] h-[15px]" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
            <span className="text-[12px] text-textItemBlur">{selected.size}/{rowIds.length} selected</span>
          </label>
          <button type="button" disabled={selected.size === 0 || busy} className={dangerBtn + ' ml-auto'} onClick={askDeleteSelection}>
            {level === 'ad' ? 'Remove selected' : 'Delete selected'}
          </button>
        </div>
      )}

      {/* Confirm strip */}
      {pending && (
        <div className="rounded-[8px] border border-[#ff7eb6]/40 bg-[#ff7eb6]/5 px-[14px] py-[12px] flex items-center gap-[12px] flex-wrap">
          <span className="text-[13px] text-btnText flex-1 min-w-[200px]">
            {pending.kind === 'campaign' && (() => {
              const adTotal = pending.items.reduce((n, i) => n + i.adCount, 0);
              return pending.items.length === 1
                ? <>Delete campaign <b>{pending.items[0].name}</b>? This also deletes its {plural(pending.items[0].adCount, 'ad')}. The underlying assets are kept.</>
                : <>Delete {plural(pending.items.length, 'campaign')}? This also deletes {plural(adTotal, 'ad')} inside them. The underlying assets are kept.</>;
            })()}
            {pending.kind === 'ad' && (() => {
              const assetTotal = pending.items.reduce((n, i) => n + i.assetCount, 0);
              return pending.items.length === 1
                ? <>Delete ad <b>{pending.items[0].name}</b>? It holds {plural(pending.items[0].assetCount, 'asset')} — those references are removed but the assets are kept.</>
                : <>Delete {plural(pending.items.length, 'ad')}? Their {plural(assetTotal, 'asset')} reference(s) are removed but the assets are kept.</>;
            })()}
            {pending.kind === 'asset' && (pending.items.length === 1
              ? <>Remove <b>{pending.items[0].name}</b> from this ad? This only unlinks it — the asset is kept.</>
              : <>Remove {plural(pending.items.length, 'asset')} from this ad? This only unlinks them — the assets are kept.</>)}
          </span>
          <button type="button" onClick={() => setPending(null)} disabled={busy}
            className="h-[32px] px-[14px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600] disabled:opacity-50">Cancel</button>
          <button type="button" onClick={confirmDelete} disabled={busy}
            className="h-[32px] px-[14px] rounded-[8px] bg-[#ff7eb6] text-newBgColor text-[12px] font-[700] disabled:opacity-50">{pending.kind === 'asset' ? 'Remove' : 'Delete'}</button>
        </div>
      )}

      {error && <div className="text-[12px] text-red-400">{error}</div>}

      {/* ---- Level: Campaigns (root) ---- */}
      {level === 'campaigns' && (
        campaigns.length === 0 ? <Empty>No campaigns yet. Create one in the <b>Campaign</b> bar above, then drill in here.</Empty>
          : displayCampaigns.length === 0 ? <Empty>No campaigns match “{query}”.</Empty>
            : view === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-[10px]">
                {displayCampaigns.map((c) => (
                  <Card key={c.campaign_id} active={state.activeCampaignId === c.campaign_id}>
                    <div className="flex items-center gap-[8px]"><Checkbox id={c.campaign_id} label={`Select ${c.name}`} />
                      <button type="button" className={trashBtn + ' ml-auto'} title="Delete campaign" onClick={() => askDeleteCampaigns([c.campaign_id])}><IconTrash /></button></div>
                    <button type="button" className="flex flex-col items-start gap-[4px] text-left" onClick={() => openCampaign(c.campaign_id)}>
                      <span className="text-textItemBlur"><IconFolder /></span>
                      <span className="text-[13px] font-[600] text-btnText truncate w-full">{c.name}</span>
                      <span className="text-[11px] text-textItemBlur">{plural(c.ad_ids.length, 'ad')}</span></button>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {displayCampaigns.map((c) => (
                  <Row key={c.campaign_id} active={state.activeCampaignId === c.campaign_id}>
                    <Checkbox id={c.campaign_id} label={`Select ${c.name}`} />
                    <button type="button" className="flex items-center gap-[12px] flex-1 min-w-0 text-left" onClick={() => openCampaign(c.campaign_id)}>
                      <span className="text-textItemBlur"><IconFolder /></span>
                      <span className="text-[14px] font-[600] text-btnText truncate flex-1">{c.name}</span>
                      {state.activeCampaignId === c.campaign_id && <span className="text-[10px] uppercase tracking-wide text-ai font-[700]">active</span>}
                      <span className="text-[12px] text-textItemBlur">{plural(c.ad_ids.length, 'ad')}</span>
                      <span className="text-textItemBlur opacity-60"><IconChevron /></span></button>
                    <button type="button" title="Delete campaign" className={trashBtn} onClick={() => askDeleteCampaigns([c.campaign_id])}><IconTrash /></button>
                  </Row>
                ))}
              </div>
            )
      )}

      {/* ---- Level: one Campaign → its Ads ---- */}
      {level === 'campaign' && (
        ads.length === 0 ? <Empty>No ads in this campaign yet. Create one in the <b>Ad</b> bar above.</Empty>
          : displayAds.length === 0 ? <Empty>No ads match “{query}”.</Empty>
            : view === 'grid' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-[10px]">
                {displayAds.map((a) => (
                  <Card key={a.ad_id} active={state.activeAdId === a.ad_id}>
                    <div className="flex items-center gap-[8px]"><Checkbox id={a.ad_id} label={`Select ${a.name}`} />
                      <button type="button" className={trashBtn + ' ml-auto'} title="Delete ad" onClick={() => askDeleteAds([a.ad_id])}><IconTrash /></button></div>
                    <button type="button" className="flex flex-col items-start gap-[4px] text-left" onClick={() => openAd(a.ad_id)}>
                      <span className="text-textItemBlur"><IconAd /></span>
                      <span className="text-[13px] font-[600] text-btnText truncate w-full">{a.name}</span>
                      <span className="text-[11px] text-textItemBlur">{plural(a.objects.length, 'asset')}</span></button>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {displayAds.map((a) => (
                  <Row key={a.ad_id} active={state.activeAdId === a.ad_id}>
                    <Checkbox id={a.ad_id} label={`Select ${a.name}`} />
                    <button type="button" className="flex items-center gap-[12px] flex-1 min-w-0 text-left" onClick={() => openAd(a.ad_id)}>
                      <span className="text-textItemBlur"><IconAd /></span>
                      <span className="text-[14px] font-[600] text-btnText truncate flex-1">{a.name}</span>
                      {state.activeAdId === a.ad_id && <span className="text-[10px] uppercase tracking-wide text-ai font-[700]">active</span>}
                      <span className="text-[12px] text-textItemBlur">{plural(a.objects.length, 'asset')}</span>
                      <span className="text-textItemBlur opacity-60"><IconChevron /></span></button>
                    <button type="button" title="Delete ad" className={trashBtn} onClick={() => askDeleteAds([a.ad_id])}><IconTrash /></button>
                  </Row>
                ))}
              </div>
            )
      )}

      {/* ---- Level: one Ad → its assets + drop zone ---- */}
      {level === 'ad' && (
        <div className="flex flex-col gap-[14px]">
          {objects.length === 0 ? <Empty>No assets in this ad yet. Use <b>Add files</b>, drop files below, or generate in Images/Video/Audio (then “Add to ad”).</Empty>
            : displayObjects.length === 0 ? <Empty>No assets match “{query}”.</Empty>
              : view === 'list' ? (
                <div className="flex flex-col gap-[8px]">
                  {displayObjects.map((o) => {
                    const url = thumbUrl(o.record);
                    return (
                      <Row key={`${o.type}:${o.id}`} active={selected.has(o.id)}>
                        <Checkbox id={o.id} label={`Select ${o.type} ${o.id}`} />
                        <span className="text-textItemBlur shrink-0">{o.type === 'audio' ? <IconAudio /> : o.type === 'clip' ? <IconAd /> : <IconImg />}</span>
                        <span className="text-[13px] text-btnText truncate flex-1">{o.id}</span>
                        <span className="text-[11px] text-textItemBlur uppercase shrink-0">{o.type}</span>
                        <span className="flex items-center gap-[2px] shrink-0">
                          <button type="button" title="Open" className={iconBtn} disabled={!url} onClick={() => openAsset(url)}><IconOpen /></button>
                          <button type="button" title="Download" className={iconBtn} disabled={!url} onClick={() => downloadAsset(url, o.id)}><IconDownload /></button>
                          <button type="button" title="Copy link" className={iconBtn} disabled={!url} onClick={() => copyLink(url)}><IconLink /></button>
                          <button type="button" title="Remove from ad" className={trashBtn} onClick={() => askRemoveAssets([o.id])}><IconTrash /></button>
                        </span>
                      </Row>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-[12px]">
                  {displayObjects.map((o) => {
                    const url = thumbUrl(o.record);
                    return (
                      <div key={`${o.type}:${o.id}`} className={'group relative rounded-[8px] overflow-hidden border bg-newBgColorInner flex flex-col ' + (selected.has(o.id) ? 'border-ai' : 'border-newBorder')}>
                        <input type="checkbox" className="absolute top-[6px] left-[6px] z-10 accent-[#d82d7e] w-[15px] h-[15px]" checked={selected.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Select ${o.type} ${o.id}`} />
                        {url && o.type === 'image' ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={o.id} className="w-full aspect-square object-cover" />
                        ) : url && o.type === 'clip' ? (
                          <video src={url} muted className="w-full aspect-square object-cover" />
                        ) : (
                          <div className="w-full aspect-square flex items-center justify-center text-textItemBlur">{o.type === 'audio' ? <IconAudio /> : <IconImg />}</div>
                        )}
                        <div className="p-[8px] flex items-center gap-[4px]">
                          <span className="text-[11px] text-textItemBlur truncate flex-1">{o.type} · {o.id}</span>
                          <button type="button" title="Open" className={iconBtn + ' h-[24px] w-[24px]'} disabled={!url} onClick={() => openAsset(url)}><IconOpen /></button>
                          <button type="button" title="Copy link" className={iconBtn + ' h-[24px] w-[24px]'} disabled={!url} onClick={() => copyLink(url)}><IconLink /></button>
                          <button type="button" title="Remove from ad" className={trashBtn + ' h-[24px] w-[24px]'} onClick={() => askRemoveAssets([o.id])}><IconTrash /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

          <div className="flex flex-col gap-[8px]">
            <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-wide">Add to this ad</span>
            <StudioDropZone onUploaded={linkUpload} />
          </div>
        </div>
      )}

      {/* Create modal — opened by the "+ Campaign" / "+ Ad" header buttons. */}
      {createKind && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]"
          onClick={() => { if (!creating) setCreateKind(null); }}>
          <div className="w-[420px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[14px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <span className="text-[15px] font-[600] text-btnText">{createKind === 'campaign' ? 'New campaign' : 'New ad'}</span>
            <input autoFocus value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void submitCreate(); }
                else if (e.key === 'Escape' && !creating) setCreateKind(null);
              }}
              placeholder={createKind === 'campaign' ? 'Campaign name' : 'Ad name'}
              className={ctrlCls + ' px-[12px] w-full placeholder:text-textItemBlur'}
              aria-label={createKind === 'campaign' ? 'Campaign name' : 'Ad name'} />
            {error && <span className="text-[12px] text-red-400">{error}</span>}
            <div className="flex items-center justify-end gap-[8px]">
              <button type="button" disabled={creating} onClick={() => setCreateKind(null)}
                className="h-[34px] px-[14px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={!newName.trim() || creating} onClick={() => void submitCreate()}
                className="h-[34px] px-[16px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[700] disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

const Row: FC<{ active?: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <div className={'group flex items-center gap-[12px] rounded-[8px] border bg-newBgColor px-[14px] py-[12px] hover:border-ai/50 transition-colors w-full ' + (active ? 'border-ai/60' : 'border-newBorder')}>{children}</div>
);
const Card: FC<{ active?: boolean; children: React.ReactNode }> = ({ active, children }) => (
  <div className={'flex flex-col gap-[8px] rounded-[8px] border bg-newBgColor px-[12px] py-[12px] hover:border-ai/50 transition-colors ' + (active ? 'border-ai/60' : 'border-newBorder')}>{children}</div>
);
const Empty: FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[24px] text-center text-[13px] text-textItemBlur">{children}</div>
);

export default StudioAssetsPanel;
