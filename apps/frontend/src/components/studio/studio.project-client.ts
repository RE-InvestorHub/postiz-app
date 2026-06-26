// Project client — transport for the Content Composer foundation (Campaign → Ad → Objects).
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.
// Assets are project-agnostic: an Ad references them by {type,id}; the same asset
// can be on many Ads/Campaigns.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export type ObjectType = 'image' | 'clip' | 'audio' | 'character' | 'lookref' | 'script';

export interface Campaign {
  campaign_id: string;
  name: string;
  brand_kit_id: string | null;
  ad_ids: string[];
}

export interface AdObject { type: ObjectType; id: string; layout?: unknown }

export interface Ad {
  ad_id: string;
  campaign_id: string;
  name: string;
  data_record_id?: string | null;
  objects: AdObject[];
}

export interface ResolvedObject extends AdObject { record: any | null }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the project service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Project service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

// --- Campaigns ---
export function listCampaigns(): Promise<Campaign[]> { return req<Campaign[]>('/campaigns'); }
export function createCampaign(payload: { name: string; brand_kit_id?: string }): Promise<Campaign> {
  return req<Campaign>('/campaigns/create', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Ads ---
export function listAds(campaignId: string): Promise<Ad[]> {
  return req<Ad[]>(`/ads?campaignId=${encodeURIComponent(campaignId)}`);
}
export function createAd(payload: { campaignId: string; name: string }): Promise<Ad> {
  return req<Ad>('/ads/create', { method: 'POST', body: JSON.stringify(payload) });
}
export function getAd(adId: string): Promise<Ad> { return req<Ad>(`/ads/${encodeURIComponent(adId)}`); }
export function updateAd(id: string, patch: Record<string, unknown>): Promise<Ad> {
  return req<Ad>('/ads/update', { method: 'POST', body: JSON.stringify({ id, patch }) });
}
export function getAdObjects(adId: string): Promise<ResolvedObject[]> {
  return req<ResolvedObject[]>(`/ads/${encodeURIComponent(adId)}/objects`);
}

// --- Objects (project-agnostic asset refs on an Ad) ---
export function addObject(payload: { adId: string; type: ObjectType; id: string }): Promise<Ad> {
  return req<Ad>('/ads/addObject', { method: 'POST', body: JSON.stringify(payload) });
}
export function removeObject(payload: { adId: string; type: ObjectType; id: string }): Promise<Ad> {
  return req<Ad>('/ads/removeObject', { method: 'POST', body: JSON.stringify(payload) });
}
