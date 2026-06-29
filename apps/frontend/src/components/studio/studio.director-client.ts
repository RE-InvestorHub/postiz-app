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
