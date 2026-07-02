// Synthetic-avatar client — transport from the Avatars tab to the workspace brain's
// /synthetic-avatar/* routes (Soul-ready anchors, register, library, cast, reshoot, voice, archive).
//
// A synthetic avatar is a BRAND-OWNED Soul-locked character (e.g. Marcus) cast as a talking-head.
// No real person → no consent gate (a brand-ownership attestation replaces it). Same-origin via
// NEXT_PUBLIC_BRAIN_URL (/api/brain), mirroring the other studio clients. Thin transport only.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string {
  return BRAIN_BASE.replace(/\/+$/, '');
}

export interface SoulAnchor {
  anchorId: string;
  name: string;
  soul_id: string;
  thumb: string | null;
}

export interface SynthAvatar {
  synth_id: string;
  name: string;
  kind: 'synthetic';
  anchor_id: string;
  soul_id: string;
  voice_id: string;
  voice_label: string;
  brand_kit_id: string;
  aspect_ratio: string;
  portrait_path: string | null;
  portrait_cdn_url: string | null;
  portrait_url: string | null;
  status: 'active' | 'archived';
  brand_owned: boolean;
  last_clip_asset_id: string | null;
  last_cast_at: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface CastResult {
  synthId: string;
  clipAssetId: string | null;
  clipPath: string | null;
  clipUrl: string;
  engine: 'kling' | 'hedra';
  durationS: number | null;
  wordSpans: { word: string; start: number; end: number }[];
  audioPath: string;
  stub: boolean;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the avatar service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Avatar service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

// --- Read ------------------------------------------------------------------

/** Soul-ready character anchors (the only characters castable as a synthetic avatar). */
export function listSoulAnchors(brandKitId?: string): Promise<SoulAnchor[]> {
  const qs = brandKitId ? `?brandKitId=${encodeURIComponent(brandKitId)}` : '';
  return req<SoulAnchor[]>(`/synthetic-avatar/anchors${qs}`);
}

/** The brand's registered synthetic avatars. */
export function listSynthAvatars(brandKitId?: string, status?: string): Promise<SynthAvatar[]> {
  const p = new URLSearchParams();
  if (brandKitId) p.set('brandKitId', brandKitId);
  if (status) p.set('status', status);
  const qs = p.toString();
  return req<SynthAvatar[]>(`/synthetic-avatar/list${qs ? `?${qs}` : ''}`);
}

export function getSynthAvatar(id: string): Promise<SynthAvatar> {
  return req<SynthAvatar>(`/synthetic-avatar/get?id=${encodeURIComponent(id)}`);
}

// --- Register + manage -----------------------------------------------------

/** Register a Soul-ready character as a synthetic avatar. SPENDS one image (locks the portrait). */
export function registerSynthAvatar(payload: {
  anchorId: string;
  voiceId: string;
  voiceLabel?: string;
  brandOwned: boolean;
  name?: string;
  aspectRatio?: string;
  brandKitId?: string;
  notes?: string;
}): Promise<SynthAvatar> {
  return post<SynthAvatar>('/synthetic-avatar/register', payload);
}

/** Cast an avatar with a script → a lip-synced clip in the Video Library. SPENDS voice + lip-sync. */
export function castSynthAvatar(payload: {
  synthId: string;
  script: string;
  aspectRatio?: string;
  resolution?: string;
}): Promise<CastResult> {
  return post<CastResult>('/synthetic-avatar/cast', payload);
}

/** Regenerate + relock the portrait. SPENDS one image. */
export function reshootPortrait(synthId: string, aspectRatio?: string): Promise<SynthAvatar> {
  return post<SynthAvatar>('/synthetic-avatar/reshoot', { synthId, aspectRatio });
}

/** Reassign the stock voice (free). */
export function setSynthVoice(synthId: string, voiceId: string, voiceLabel?: string): Promise<SynthAvatar> {
  return post<SynthAvatar>('/synthetic-avatar/voice', { synthId, voiceId, voiceLabel });
}

/** Archive (soft-remove; keeps the record + cast clips). Free. */
export function archiveSynthAvatar(synthId: string): Promise<SynthAvatar> {
  return post<SynthAvatar>('/synthetic-avatar/archive', { synthId });
}
