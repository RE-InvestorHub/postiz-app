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

export interface AvatarEngine {
  id: string;
  label: string;
  vendor: string;
  note?: string;
}

export interface PortraitOption {
  id: string;
  path: string;
  url: string;
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
  engine: string;
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

/** The selectable cast engines (HeyGen + fal.ai) for the model selector. */
export function listAvatarEngines(): Promise<AvatarEngine[]> {
  return req<AvatarEngine[]>('/synthetic-avatar/engines');
}

/** A character's clean portrait candidates (its Soul reference-sheet frames) to pick from. */
export function listPortraitOptions(anchorId: string): Promise<PortraitOption[]> {
  return req<PortraitOption[]>(`/synthetic-avatar/portrait-options?anchorId=${encodeURIComponent(anchorId)}`);
}

/** Set an avatar's default cast engine (the model selector). */
export function setSynthEngine(synthId: string, engine: string): Promise<SynthAvatar> {
  return post<SynthAvatar>('/synthetic-avatar/engine', { synthId, engine });
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
  /** Pick a clean reference-sheet frame / uploaded headshot (copied in, free). Omit to generate one. */
  portraitUrl?: string;
  name?: string;
  aspectRatio?: string;
  brandKitId?: string;
  notes?: string;
}): Promise<SynthAvatar> {
  return post<SynthAvatar>('/synthetic-avatar/register', payload);
}

export interface CastJob {
  status: 'casting' | 'done' | 'error';
  result?: CastResult;
  error?: string;
}

export interface CastPayload {
  synthId: string;
  script: string;
  aspectRatio?: string;
  resolution?: string;
  /** Override the avatar's selected engine for this cast (heygen | omnihuman | kling). */
  engine?: string;
}

/**
 * Start a cast job. SPENDS voice + lip-sync. Returns a jobId immediately — TTS + lip-sync (Hedra)
 * can take minutes, longer than the proxy request timeout, so casting is async. Poll castStatus,
 * or use castAndWait for a single call that resolves to the finished clip.
 */
export function castSynthAvatar(payload: CastPayload): Promise<{ jobId: string; status: string }> {
  return post<{ jobId: string; status: string }>('/synthetic-avatar/cast', payload);
}

/** Poll a cast job. */
export function castStatus(jobId: string): Promise<CastJob> {
  return req<CastJob>(`/synthetic-avatar/cast/status?jobId=${encodeURIComponent(jobId)}`);
}

/** Start a cast and poll until the clip is ready (or it errors). Resolves to the finished clip. */
export async function castAndWait(payload: CastPayload, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<CastResult> {
  const { intervalMs = 3000, timeoutMs = 10 * 60 * 1000 } = opts;
  const { jobId } = await castSynthAvatar(payload);
  const deadline = Date.now() + timeoutMs;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const job = await castStatus(jobId);
    if (job.status === 'done' && job.result) return job.result;
    if (job.status === 'error') throw new Error(job.error || 'Cast failed');
    if (Date.now() > deadline) throw new Error('Cast timed out');
  }
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

/** Permanently delete an avatar (record + its portrait/VO files). Cast clips are kept. Irreversible. */
export function deleteSynthAvatar(synthId: string): Promise<{ deleted: number; synthId: string }> {
  return post<{ deleted: number; synthId: string }>('/synthetic-avatar/delete', { synthId });
}
