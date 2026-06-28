'use client';

// Project bar — the active Brand → Campaign → Ad context, shared across every Studio tab.
// Three dropdown + "＋" pairs: Brand ▾ ＋ · Campaign ▾ ＋ · Ad ▾ ＋. Each ＋ opens a small
// naming popup (no inline text boxes). Campaigns are scoped to the active Brand; Ads to the
// active Campaign. Generators' "Add to ad" + the composers target the selected Ad. Postiz tokens only.

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import {
  listCampaigns, createCampaign, listAds, createAd, Campaign, Ad,
} from '@gitroom/frontend/components/studio/studio.project-client';
import { listBrands, createBrand, Brand } from '@gitroom/frontend/components/studio/studio.brand-client';

type NameTarget = 'brand' | 'campaign' | 'ad';

export const StudioProjectBar: FC = () => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [naming, setNaming] = useState<NameTarget | null>(null);
  const [nameText, setNameText] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const activeBrandId = state.composerBrandKitId || 'default';

  const loadBrands = useCallback(async () => {
    try { setBrands(await listBrands()); } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, []);
  const loadCampaigns = useCallback(async (brandKitId: string) => {
    try { setCampaigns(await listCampaigns(brandKitId)); } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, []);

  useEffect(() => { void loadBrands(); }, [loadBrands]);
  // Campaigns are scoped to the active brand; reload when it changes.
  useEffect(() => { void loadCampaigns(activeBrandId); }, [activeBrandId, loadCampaigns]);

  useEffect(() => {
    if (!state.activeCampaignId) { setAds([]); return; }
    let live = true;
    listAds(state.activeCampaignId).then((a) => { if (live) setAds(a); }).catch(() => {});
    return () => { live = false; };
  }, [state.activeCampaignId]);

  // Focus the naming input when the popup opens.
  useEffect(() => { if (naming) setTimeout(() => inputRef.current?.focus(), 0); }, [naming]);

  const onSelectBrand = (id: string) => {
    dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: id || 'default' });
    // Brand changed → its campaigns/ads no longer apply.
    dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: null });
  };

  const openName = (t: NameTarget) => { setError(null); setNameText(''); setNaming(t); };
  const submitName = useCallback(async () => {
    const name = nameText.trim();
    if (!name || creating) return;
    setCreating(true); setError(null);
    try {
      if (naming === 'brand') {
        const b = await createBrand({ name });
        await loadBrands();
        onSelectBrand(b.brand_kit_id);
        toaster.show('Brand created — open the Brand tab to add its logos.', 'success');
      } else if (naming === 'campaign') {
        const c = await createCampaign({ name, brand_kit_id: activeBrandId });
        await loadCampaigns(activeBrandId);
        dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: c.campaign_id });
      } else if (naming === 'ad') {
        if (!state.activeCampaignId) return;
        const a = await createAd({ campaignId: state.activeCampaignId, name });
        setAds(await listAds(state.activeCampaignId));
        dispatch({ type: 'SET_ACTIVE_AD', adId: a.ad_id });
      }
      setNaming(null); setNameText('');
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setCreating(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameText, creating, naming, activeBrandId, state.activeCampaignId, loadBrands, loadCampaigns, dispatch, toaster]);

  const selectCls = 'h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText max-w-[200px]';
  const addCls = 'h-[36px] w-[36px] rounded-[8px] bg-btnPrimary text-btnText text-[16px] font-[600] leading-none flex items-center justify-center hover:opacity-90 disabled:opacity-50';
  const sep = <span className="text-textItemBlur text-[16px] leading-none" aria-hidden="true">›</span>;

  const labels: Record<NameTarget, string> = { brand: 'brand', campaign: 'campaign', ad: 'ad' };

  return (
    <div className="flex flex-wrap items-center gap-[8px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[10px]">
      {/* Brand */}
      <select className={selectCls} value={activeBrandId} onChange={(e) => onSelectBrand(e.target.value)} title="Active brand">
        {brands.map((b) => <option key={b.brand_kit_id} value={b.brand_kit_id}>{b.name}{b.tier && b.tier !== 'complete' ? ' (draft)' : ''}</option>)}
      </select>
      <button type="button" onClick={() => openName('brand')} title="New brand" aria-label="New brand" className={addCls}>＋</button>

      {sep}

      {/* Campaign (within the active brand) */}
      <select className={selectCls} value={state.activeCampaignId ?? ''}
        onChange={(e) => dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: e.target.value || null })} title="Active campaign">
        <option value="">Campaign…</option>
        {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
      </select>
      <button type="button" onClick={() => openName('campaign')} title="New campaign" aria-label="New campaign" className={addCls}>＋</button>

      {sep}

      {/* Ad (within the active campaign) */}
      <select className={selectCls} value={state.activeAdId ?? ''} disabled={!state.activeCampaignId}
        onChange={(e) => dispatch({ type: 'SET_ACTIVE_AD', adId: e.target.value || null })} title="Active ad">
        <option value="">{state.activeCampaignId ? 'Ad…' : 'pick a campaign'}</option>
        {ads.map((a) => <option key={a.ad_id} value={a.ad_id}>{a.name} ({a.objects.length})</option>)}
      </select>
      <button type="button" onClick={() => openName('ad')} disabled={!state.activeCampaignId}
        title={state.activeCampaignId ? 'New ad' : 'Pick a campaign first'} aria-label="New ad" className={addCls}>＋</button>

      {error && <span className="text-[12px] text-red-400">{error}</span>}

      {/* Naming popup — opened by any ＋ button */}
      {naming && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => !creating && setNaming(null)}>
          <div className="w-[360px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[18px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <span className="text-[14px] font-[700] text-btnText capitalize">Name your {labels[naming]}</span>
            <input ref={inputRef} value={nameText} onChange={(e) => setNameText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void submitName(); } if (e.key === 'Escape') setNaming(null); }}
              placeholder={`New ${labels[naming]} name`}
              className="h-[38px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur" />
            {error && <span className="text-[12px] text-red-400">{error}</span>}
            <div className="flex items-center justify-end gap-[8px]">
              <button type="button" onClick={() => setNaming(null)} className="h-[34px] px-[14px] rounded-[8px] border border-newBorder text-textItemBlur text-[12px] hover:text-btnText">Cancel</button>
              <button type="button" onClick={() => void submitName()} disabled={creating || !nameText.trim()}
                className="h-[34px] px-[16px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[700] hover:opacity-90 disabled:opacity-50">{creating ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
};
