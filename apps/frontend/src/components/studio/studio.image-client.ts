// Image-library transport — the brand-scoped image gallery on the Images tab.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface BrandImage {
  id: string;
  url: string;
  model: string | null;
  prompt: string | null;
  stage: string | null;
  brandKitId: string;
  provenance: string | null;
  w: number | null;
  h: number | null;
  createdAt: string | null;
  // Channel-reshape lineage (present on reshaped variants).
  channel?: string | null;
  channelLabel?: string | null;
  channelShort?: string | null;
  fit?: string | null;
  sourceId?: string | null;
  /** Graphics-edit lineage: the op that produced this variant (e.g. "duotone", "magick"). */
  editOp?: string | null;
}

export interface ChannelPreset {
  id: string; label: string; short: string; w: number; h: number; aspectRatio: string;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brain ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** All images for a brand (generations + uploads), newest first. */
export function listBrandImages(brandKitId: string): Promise<BrandImage[]> {
  return req<{ images: BrandImage[] }>(`/images?brandKitId=${encodeURIComponent(brandKitId)}`).then((r) => r.images || []);
}

/** Remove an image from the library (manifest + file). */
export function deleteBrandImage(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>('/images/delete', { method: 'POST', body: JSON.stringify({ id }) });
}

/** Bulk-remove images from the library (select-and-delete). */
export function deleteBrandImages(ids: string[]): Promise<{ ok: boolean; deleted: number }> {
  return req<{ ok: boolean; deleted: number }>('/images/delete', { method: 'POST', body: JSON.stringify({ ids }) });
}

/** Social channel size presets for the canvas Reshape dropdown. */
export function listChannelPresets(): Promise<ChannelPreset[]> {
  return req<{ channels: ChannelPreset[] }>('/images/channels').then((r) => r.channels || []);
}

/** Reshape an image to a channel's exact size (non-destructive — returns a NEW variant). */
export function reshapeImage(id: string, channel: string, fit: 'crop' | 'pad'): Promise<BrandImage> {
  return req<BrandImage>('/images/reshape', { method: 'POST', body: JSON.stringify({ id, channel, fit }) });
}

/** The result of a graphics edit — a new library variant. */
export interface ImageEditResult {
  id: string; url: string; path: string; op: string; sourceId: string; brandKitId: string;
}

/** The graphics-engineer op catalog (typed ops + their params) for discovery. */
export interface ImageOpsCatalog {
  ops: Record<string, { group: string; help: string; params: Record<string, string> }>;
  magick: { help: string };
}

/** The graphics-engineer op catalog (typed ops + their params) for discovery. */
export function listImageOps(): Promise<ImageOpsCatalog> {
  return req<ImageOpsCatalog>('/images/ops');
}

/**
 * Apply a typed graphics edit to a library image — FREE, non-destructive (new variant).
 * NOTE: when the AGENT edits, the brain already runs the op in its tool loop (so it can see the
 * result and iterate); the agent capability only refreshes the library. This transport is the
 * direct/manual lever — the same one a future inline editor UI would call.
 */
export function editImage(sourceId: string, op: string, params: Record<string, unknown> = {}): Promise<ImageEditResult> {
  return req<ImageEditResult>('/images/edit', { method: 'POST', body: JSON.stringify({ sourceId, op, params }) });
}

/** Apply a guarded general ImageMagick chain to a library image — FREE, non-destructive. */
export function magickImage(sourceId: string, ops: string[]): Promise<ImageEditResult> {
  return req<ImageEditResult>('/images/magick', { method: 'POST', body: JSON.stringify({ sourceId, ops }) });
}
