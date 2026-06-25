// Previs client — transport for the Storyboard tab (synthetic character anchors,
// capture, restage, look references). Same-origin via NEXT_PUBLIC_BRAIN_URL
// (/api/brain), mirroring the other studio clients. Thin transport only.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string {
  return BRAIN_BASE.replace(/\/+$/, '');
}

export interface GeneratedImage {
  id: string;
  url: string;
  cdnUrl: string;
}

export interface CharacterAnchor {
  anchor_id: string;
  source: 'synthetic' | 'avatar';
  name: string;
  reference_job_id: string;
  reference_images: string[];
  identity_clause: string;
  descriptor: string;
  soul_id: string | null;
  scope: 'project' | 'global';
  tags: string[];
}

export type LookRefKind = 'lighting' | 'style' | 'environment' | 'palette' | 'lens' | 'character';

export interface LookReference {
  lookref_id: string;
  kind: LookRefKind;
  name: string;
  descriptor: string;
  reference_images: string[];
  tags: string[];
  scope: 'project' | 'global';
}

export interface RestageResult {
  id: string;
  url: string;
  cdnUrl: string;
  conditionedBy: { anchorId: string; lookRefIds: string[]; soul_id: string | null };
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the previs service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Previs service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** Extract the Higgsfield job-id (a UUID) from a generated image CDN url.
 *  Filenames look like hf_<YYYYMMDD>_<HHMMSS>_<uuid>.png — match the canonical UUID
 *  directly so we don't depend on the number of timestamp groups before it. */
export function jobIdFromUrl(cdnUrl: string): string | null {
  const m = cdnUrl?.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
  return m ? m[0] : null;
}

/** Generate a fresh image (no reference) via the existing studio generate route. */
export function generateImage(payload: { prompt: string; model?: string; aspectRatio?: string; resolution?: string }): Promise<GeneratedImage> {
  return req<GeneratedImage>('/studio/generate', {
    method: 'POST',
    body: JSON.stringify({ tab: 'images', ...payload }),
  });
}

/** Capture a generation (by its Higgsfield job-id) as a reusable synthetic character anchor. */
export function captureCharacter(payload: { jobId: string; name?: string; descriptor?: string; referenceImages?: string[]; scope?: string; tags?: string[] }): Promise<CharacterAnchor> {
  return req<CharacterAnchor>('/previs/capture', { method: 'POST', body: JSON.stringify(payload) });
}

/** Restage a captured character into a new scene (conditions on the anchor reference). */
export function restage(payload: { anchorId: string; scenePrompt: string; lookRefIds?: string[]; model?: string; platform?: string; aspectRatio?: string; resolution?: string }): Promise<RestageResult> {
  return req<RestageResult>('/previs/restage', { method: 'POST', body: JSON.stringify(payload) });
}

/** Save a reusable look reference (Tier-1 descriptor + optional reference pixels). */
export function saveLookRef(payload: { kind: LookRefKind; descriptor?: string; referenceImages?: string[]; name?: string; tags?: string[]; scope?: string }): Promise<LookReference> {
  return req<LookReference>('/previs/lookref', { method: 'POST', body: JSON.stringify(payload) });
}

export function listAnchors(source?: string): Promise<CharacterAnchor[]> {
  return req<CharacterAnchor[]>(`/previs/anchors${source ? `?source=${encodeURIComponent(source)}` : ''}`);
}

export function listLookRefs(kind?: string): Promise<LookReference[]> {
  return req<LookReference[]>(`/previs/lookrefs${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
}
