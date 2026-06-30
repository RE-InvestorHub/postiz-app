// Scene Director transport — dimensions/presets for the dropdowns + the layered-comp render.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface DirectorPreset { id: string; label: string; fragment: string; brandAware?: boolean }
export interface DirectorComponent { id: string; name: string; type: string }
export interface DirectorDimension {
  id: string; label: string; hint: string;
  component: string | null;
  presets: DirectorPreset[];
  components: DirectorComponent[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brain ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** Director dimensions + presets + the brand's saved reusable components (one call → the dropdowns). */
export function listDirectorDimensions(brandKitId: string): Promise<DirectorDimension[]> {
  return req<{ dimensions: DirectorDimension[] }>(`/director/dimensions?brandKitId=${encodeURIComponent(brandKitId)}`).then((r) => r.dimensions || []);
}

export interface DirectorTemplate {
  id: string; name: string; selection: Record<string, string>;
  renderMode: string; aspect: string; brandKitId: string | null; created_at: string;
}
/** List saved shot templates (selection sets) for a brand. */
export function listDirectorTemplates(brandKitId: string): Promise<DirectorTemplate[]> {
  return req<{ templates: DirectorTemplate[] }>(`/director/templates?brandKitId=${encodeURIComponent(brandKitId)}`).then((r) => r.templates || []);
}
export function saveDirectorTemplate(payload: { name: string; selection: Record<string, string>; renderMode: string; aspect: string; brandKitId: string }): Promise<DirectorTemplate> {
  return req('/director/templates', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteDirectorTemplate(id: string): Promise<{ ok: boolean }> {
  return req('/director/templates/delete', { method: 'POST', body: JSON.stringify({ id }) });
}

/** Component kinds a library image can be captured as (character = previs anchor; rest = lookrefs). */
export const COMPONENT_KINDS: { id: string; label: string }[] = [
  { id: 'character', label: 'Character' }, { id: 'environment', label: 'Scene / Background' },
  { id: 'lighting', label: 'Lighting' }, { id: 'style', label: 'Style' },
  { id: 'palette', label: 'Palette' }, { id: 'lens', label: 'Lens / Look' },
];

/** Capture a library image as a reusable, named, brand-scoped Director component. */
export function captureComponent(imageId: string, kind: string, name: string, brandKitId: string): Promise<{ type: string; id: string; name: string }> {
  return req('/director/capture-component', { method: 'POST', body: JSON.stringify({ imageId, kind, name, brandKitId }) });
}

/**
 * Render a shot via the layered-comp pipeline (the Create gate — spends credits). ASYNC: the
 * render runs in the background (a layered shot is ~80-90s, past the proxy timeout), so we start
 * it (→ jobId) and POLL until done. The agent's spec carries the dimension fields +
 * renderMode/aspectRatio/anchorId; this maps them to the endpoint.
 */
export async function renderDirectorShot(brandKitId: string, spec: Record<string, unknown>): Promise<{ id: string; url: string; mode: string; layers: unknown }> {
  const { renderMode, aspectRatio, anchorId, brandKitId: _b, ...dims } = spec as any;
  const { jobId } = await req<{ jobId: string }>('/director/render', {
    method: 'POST',
    body: JSON.stringify({ spec: dims, brandKitId, mode: renderMode === 'single' ? 'single' : 'layered', aspectRatio: aspectRatio || '4:5', anchorId: anchorId || null }),
  });
  // Poll for completion (each request is fast; the render proceeds server-side).
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 120; i++) { // up to ~6 min
    await sleep(3000);
    const job = await req<{ status: string; result?: any; error?: string }>(`/director/render/status?jobId=${encodeURIComponent(jobId)}`);
    if (job.status === 'done') return job.result;
    if (job.status === 'error') throw new Error(job.error || 'Render failed.');
  }
  throw new Error('Render timed out.');
}

/** Poll the shared /director/render/status job map until done (clip + gap-fill reuse it). */
async function pollRenderResult(jobId: string, maxTries = 120): Promise<{ id: string; url: string; [k: string]: unknown }> {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxTries; i++) {
    await sleep(3000);
    const job = await req<{ status: string; result?: any; error?: string }>(`/director/render/status?jobId=${encodeURIComponent(jobId)}`);
    if (job.status === 'done') return job.result;
    if (job.status === 'error') throw new Error(job.error || 'Render failed.');
  }
  throw new Error('Render timed out.');
}

export interface VideoMotion { movement?: string; action?: string; speed?: string }

/**
 * Scene Director → ONE clip (the "Clip" output). text-to-video from the spec + motion, or
 * image-to-video when firstFrameUrl is given. SPENDS credits → gated at the call site. ASYNC poll.
 */
export async function renderDirectorClip(
  brandKitId: string,
  spec: Record<string, unknown>,
  opts: { motion?: VideoMotion; model?: string; aspectRatio?: string; durationS?: number; firstFrameUrl?: string | null } = {}
): Promise<{ id: string; url: string }> {
  const { jobId } = await req<{ jobId: string }>('/director/render-clip', {
    method: 'POST',
    body: JSON.stringify({
      spec, brandKitId, motion: opts.motion || {}, model: opts.model || 'veo3_1',
      aspectRatio: opts.aspectRatio || '9:16', durationS: opts.durationS ?? 6,
      firstFrameUrl: opts.firstFrameUrl || null,
    }),
  });
  return pollRenderResult(jobId, 160) as Promise<{ id: string; url: string }>;
}

/**
 * Scene Director → gap-fill the numbered keyframe sequence into one short (the "Video" output).
 * Each consecutive pair → a start→end morph segment (Kling/Seedance) → concat. SPENDS → gated.
 */
export async function gapFillVideo(
  brandKitId: string,
  keyframeIds: string[],
  opts: { motion?: VideoMotion; model?: string; aspectRatio?: string; totalDurationS?: number; style?: string } = {}
): Promise<{ id: string; url: string; segments?: number }> {
  const { jobId } = await req<{ jobId: string }>('/video/gapfill', {
    method: 'POST',
    body: JSON.stringify({
      keyframeIds, brandKitId, motion: opts.motion || {}, model: opts.model || 'kling3_0',
      aspectRatio: opts.aspectRatio || '9:16', totalDurationS: opts.totalDurationS ?? 15,
      ...(opts.style ? { style: opts.style } : {}),
    }),
  });
  return pollRenderResult(jobId, 240) as Promise<{ id: string; url: string; segments?: number }>;
}

export interface SoulStatus {
  anchorId: string;
  soul_id: string | null;
  soul_status: 'training' | 'ready' | 'failed' | null;
  soul_model?: string | null;
  frames?: number;
}

/** Read-only Soul status for a character anchor (drives the UI pill). */
export function getSoulStatus(anchorId: string): Promise<SoulStatus> {
  return req<SoulStatus>(`/director/soul/status?anchorId=${encodeURIComponent(anchorId)}`);
}

/** The character anchor a library image was saved into (or null) — for the canvas Capture-Soul button. */
export function anchorForImage(imageId: string): Promise<{ anchorId: string; name: string; soul_status: string | null } | null> {
  return req<{ anchor: { anchorId: string; name: string; soul_status: string | null } | null }>(`/director/anchor-for-image?imageId=${encodeURIComponent(imageId)}`).then((r) => r.anchor);
}

/**
 * Promote a character anchor to a trained Soul (hard identity lock) — SPENDS credits (reference
 * sheet + Soul training), so this is approval-gated. NON-BLOCKING: kicks the async job and returns
 * its jobId immediately; the global SoulTrainingWatcher polls to completion + notifies. (Training
 * takes ~8–15 min and runs server-side regardless of the client.)
 */
export function startSoulTraining(anchorId: string, model: 'soul-2' | 'soul-cinematic' = 'soul-2'): Promise<{ jobId: string; status: string }> {
  return req<{ jobId: string; status: string }>('/director/soul/train', {
    method: 'POST',
    body: JSON.stringify({ anchorId, model }),
  });
}

/** Poll a soul-training job once (used by the global watcher). */
export function pollSoulJob(jobId: string): Promise<{ status: string; result?: { soul_id: string }; error?: string }> {
  return req(`/director/soul/status?jobId=${encodeURIComponent(jobId)}`);
}

/**
 * Remove a character's Soul — clears the Soul link (reverts to reference conditioning) + deletes the
 * local training frames. NO spend. The Higgsfield-side Soul cannot be deleted via their CLI, so it
 * remains in the Higgsfield account; the response's `higgsfieldNote` explains this.
 */
export function removeSoul(anchorId: string): Promise<{ anchorId: string; removedSoulId: string | null; deletedFrames: number; higgsfieldDeleted: boolean; higgsfieldNote: string | null }> {
  return req('/director/soul/remove', { method: 'POST', body: JSON.stringify({ anchorId }) });
}
