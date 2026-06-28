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
 * Render a shot via the layered-comp pipeline (the Create gate — spends credits). The agent's
 * spec carries the dimension fields + renderMode/aspectRatio/anchorId; this maps them to the endpoint.
 */
export function renderDirectorShot(brandKitId: string, spec: Record<string, unknown>): Promise<{ id: string; url: string; mode: string; layers: unknown }> {
  const { renderMode, aspectRatio, anchorId, brandKitId: _b, ...dims } = spec as any;
  return req('/director/render', {
    method: 'POST',
    body: JSON.stringify({ spec: dims, brandKitId, mode: renderMode === 'single' ? 'single' : 'layered', aspectRatio: aspectRatio || '4:5', anchorId: anchorId || null }),
  });
}
