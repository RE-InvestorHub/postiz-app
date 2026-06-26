// Composer client — transport for the Content Composer's Still deliverable.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.
// Brand comes from a swappable Brand Kit (roles); a Still renders one branded
// asset per channel. See brain: /brandkits, /compose/channels, /compose/still.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface BrandRoles {
  primary?: string; secondary?: string; accent?: string;
  surface?: string; onSurface?: string;
  logoMono?: string; logoPrimary?: string;
  headlineFont?: string | null; bodyFont?: string | null;
}
export interface BrandKit {
  brand_kit_id: string;
  name: string;
  builtin?: boolean;
  roles: BrandRoles;
}

export interface Channel {
  id: string; label: string; w: number; h: number; aspect: string;
  safeArea: { top: number; bottom: number };
}

export interface DataCallout { label: string; value: string }
export interface ComposeCopy {
  headline?: string; sub?: string; cta?: string; data?: DataCallout[];
}
export interface ComposeResult {
  id: string; url: string; channelId: string; label: string; w: number; h: number;
}
export interface ComposeResponse { brandKitId: string; results: ComposeResult[] }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the composer service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Composer service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

// --- Brand Kits ---
export function listBrandKits(): Promise<BrandKit[]> { return req<BrandKit[]>('/brandkits'); }
export function createBrandKit(payload: { name: string; roles?: BrandRoles }): Promise<BrandKit> {
  return req<BrandKit>('/brandkits/create', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateBrandKit(payload: { id: string; patch: { name?: string; roles?: BrandRoles } }): Promise<BrandKit> {
  return req<BrandKit>('/brandkits/update', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Channels ---
export function listComposerChannels(): Promise<Channel[]> { return req<Channel[]>('/compose/channels'); }

// --- Compose ---
export function composeStill(payload: {
  imageRef: string;
  copy: ComposeCopy;
  channels: string[];
  brandKitId?: string;
  adId?: string;
  addToAd?: boolean;
  templateId?: string;
  slotBindings?: Record<string, string>;
  layout?: { elements: Array<{ key: string; x: number; y: number; size?: number; backdrop?: boolean }> };
}): Promise<ComposeResponse> {
  return req<ComposeResponse>('/compose/still', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Composer Templates (reusable structure: slots + copy + channels) ---
export interface TemplateSlot { key: string; type: string; required: boolean }
export interface ComposerTemplate {
  template_id: string;
  name: string;
  kind: string;
  slots: TemplateSlot[];
  copy: { headline?: string; sub?: string; cta?: string; dataLabels?: { label: string }[] };
  channels: string[];
  layout?: { elements: Array<{ key: string; x: number; y: number; size?: number; backdrop?: boolean }> };
}
export function listTemplates(kind?: string): Promise<ComposerTemplate[]> {
  return req<ComposerTemplate[]>(`/composer/templates${kind ? `?kind=${encodeURIComponent(kind)}` : ''}`);
}
export function createTemplateFromStill(payload: { name: string; copy: ComposeCopy; channels: string[]; layout?: { elements: Array<{ key: string; x: number; y: number; size?: number; backdrop?: boolean }> } }): Promise<ComposerTemplate> {
  return req<ComposerTemplate>('/composer/templates/createFromStill', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteTemplate(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>('/composer/templates/delete', { method: 'POST', body: JSON.stringify({ id }) });
}

// --- Carousel + Email deliverables ---
export interface CarouselSlide { imageRef: string; copy?: ComposeCopy }
export interface CarouselResult { id: string; url: string; slide: number; channelId: string; w: number; h: number }
export function composeCarousel(payload: {
  adId?: string; slides: CarouselSlide[]; channel?: string; brandKitId?: string; addToAd?: boolean;
}): Promise<{ brandKitId: string; slides: CarouselResult[] }> {
  return req('/compose/carousel', { method: 'POST', body: JSON.stringify(payload) });
}

export interface EmailCopy { headline: string; sub?: string; body?: string; cta?: string; ctaUrl?: string }
export function composeEmail(payload: {
  adId?: string; heroRef?: string; heroUrl?: string; copy: EmailCopy; brandKitId?: string;
}): Promise<{ id: string; url: string; brandKitId: string }> {
  return req('/compose/email', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Video ad: channel × length cuts of an existing clip ---
export const VIDEO_AD_LENGTHS = [6, 15, 30, 60];
export interface VideoAdCut { id: string; url: string; channelId: string; length: number; w: number; h: number }
export interface VideoAdSkip { channelId: string; length: number; reason: string }
export interface MusicSpec { bedId?: string; mood?: string; bpm?: number; volume?: number; duck?: boolean }
export function composeVideoAd(payload: {
  adId?: string; clipRef: string; channels: string[]; lengths: number[]; copy?: ComposeCopy; brandKitId?: string; addToAd?: boolean; music?: MusicSpec;
}): Promise<{ brandKitId: string; cuts: VideoAdCut[]; skipped: VideoAdSkip[]; sourceDuration: number; music?: string | false }> {
  return req('/compose/video-ad', { method: 'POST', body: JSON.stringify(payload) });
}

// Build a viewable URL for a brain /assets path or a CDN url.
export function assetUrl(pathOrUrl: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${base()}/assets/${pathOrUrl.replace(/^\/+/, '')}`;
}
