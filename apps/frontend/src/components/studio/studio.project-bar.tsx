'use client';

// Project bar — the active Campaign + Ad context, shared across every Studio tab.
// Generators' "Add to ad" and the composers target the selected Ad. Assets stay
// project-agnostic (an Ad just references them). Postiz tokens only.

import { FC, useCallback, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import {
  listCampaigns, createCampaign, listAds, createAd, Campaign, Ad,
} from '@gitroom/frontend/components/studio/studio.project-client';

export const StudioProjectBar: FC = () => {
  const { state, dispatch } = useStudio();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [newCampaign, setNewCampaign] = useState('');
  const [newAd, setNewAd] = useState('');
  const [creating, setCreating] = useState<'campaign' | 'ad' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    try { setCampaigns(await listCampaigns()); } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, []);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);

  useEffect(() => {
    if (!state.activeCampaignId) { setAds([]); return; }
    let live = true;
    listAds(state.activeCampaignId).then((a) => { if (live) setAds(a); }).catch(() => {});
    return () => { live = false; };
  }, [state.activeCampaignId]);

  const doCreateCampaign = useCallback(async () => {
    if (!newCampaign.trim()) return;
    setCreating('campaign'); setError(null);
    try {
      const c = await createCampaign({ name: newCampaign.trim() });
      setNewCampaign('');
      await loadCampaigns();
      dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: c.campaign_id });
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setCreating(null); }
  }, [newCampaign, loadCampaigns, dispatch]);

  const doCreateAd = useCallback(async () => {
    if (!newAd.trim() || !state.activeCampaignId) return;
    setCreating('ad'); setError(null);
    try {
      const a = await createAd({ campaignId: state.activeCampaignId, name: newAd.trim() });
      setNewAd('');
      setAds(await listAds(state.activeCampaignId));
      dispatch({ type: 'SET_ACTIVE_AD', adId: a.ad_id });
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setCreating(null); }
  }, [newAd, state.activeCampaignId, dispatch]);

  const selectCls = 'h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText';
  const inputCls = 'h-[36px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur w-[150px]';

  return (
    <div className="flex flex-wrap items-center gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[10px]">
      <span className="text-[12px] font-[600] text-textItemBlur uppercase tracking-wide">Project</span>

      {/* Campaign */}
      <select className={selectCls} value={state.activeCampaignId ?? ''}
        onChange={(e) => dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: e.target.value || null })}>
        <option value="">Campaign…</option>
        {campaigns.map((c) => <option key={c.campaign_id} value={c.campaign_id}>{c.name}</option>)}
      </select>
      <input className={inputCls} value={newCampaign} onChange={(e) => setNewCampaign(e.target.value)} placeholder="New campaign" />
      <button type="button" disabled={creating === 'campaign' || !newCampaign.trim()} onClick={doCreateCampaign}
        className="h-[36px] px-[12px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">＋ Campaign</button>

      <span className="text-textItemBlur">/</span>

      {/* Ad (within the active campaign) */}
      <select className={selectCls} value={state.activeAdId ?? ''} disabled={!state.activeCampaignId}
        onChange={(e) => dispatch({ type: 'SET_ACTIVE_AD', adId: e.target.value || null })}>
        <option value="">{state.activeCampaignId ? 'Ad…' : 'pick a campaign'}</option>
        {ads.map((a) => <option key={a.ad_id} value={a.ad_id}>{a.name} ({a.objects.length})</option>)}
      </select>
      <input className={inputCls} value={newAd} onChange={(e) => setNewAd(e.target.value)} placeholder="New ad" disabled={!state.activeCampaignId} />
      <button type="button" disabled={creating === 'ad' || !newAd.trim() || !state.activeCampaignId} onClick={doCreateAd}
        className="h-[36px] px-[12px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">＋ Ad</button>

      {error && <span className="text-[12px] text-red-400">{error}</span>}
    </div>
  );
};
