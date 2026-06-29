// Video-library transport — the brand-scoped Video tab library (clips/shorts + keyframe stills)
// and the Images→Video keyframe bridge. Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain).
// Thin transport only. Mirrors studio.image-client.ts.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

/** A clip/short in the brand's Video library (kind:'video' manifest). */
export interface BrandClip {
  id: string;
  url: string;
  kind: 'clip';
  model: string | null;
  prompt: string | null;
  stage: string | null;
  brandKitId: string;
  provenance: string | null;
  durationS: number | null;
  createdAt: string | null;
}

/** A keyframe still in the brand's Video library (kind:'image' manifest marked keyframe:true). */
export interface BrandKeyframe {
  id: string;
  url: string;
  kind: 'keyframe';
  model: string | null;
  prompt: string | null;
  stage: string | null;
  brandKitId: string;
  provenance: string | null;
  w: number | null;
  h: number | null;
  createdAt: string | null;
}

export interface VideoLibrary { clips: BrandClip[]; keyframes: BrandKeyframe[]; }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brain ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** The brand's Video library — clips/shorts + keyframe stills, each newest-first. */
export function listVideoLibrary(brandKitId: string): Promise<VideoLibrary> {
  return req<VideoLibrary>(`/video/library?brandKitId=${encodeURIComponent(brandKitId)}`)
    .then((r) => ({ clips: r.clips || [], keyframes: r.keyframes || [] }));
}

/** Mark image manifests as keyframes (the Images→Video bridge persists here). */
export function addKeyframes(imageIds: string[]): Promise<{ ok: boolean; updated: string[] }> {
  return req('/video/keyframes', { method: 'POST', body: JSON.stringify({ imageIds }) });
}

/** Un-mark image manifests as keyframes (remove from the Video Library's Keyframes view). */
export function removeKeyframe(imageId: string): Promise<{ ok: boolean; updated: string[] }> {
  return req('/video/keyframes/remove', { method: 'POST', body: JSON.stringify({ imageId }) });
}

/** Remove a clip from the library (manifest + file). Reuses the kind-agnostic /images/delete. */
export function deleteBrandClip(id: string): Promise<{ ok: boolean }> {
  return req('/images/delete', { method: 'POST', body: JSON.stringify({ id }) });
}

/** Bulk-remove clips from the library. */
export function deleteBrandClips(ids: string[]): Promise<{ ok: boolean; deleted: number }> {
  return req('/images/delete', { method: 'POST', body: JSON.stringify({ ids }) });
}
