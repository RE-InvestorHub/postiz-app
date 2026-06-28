// Brand client — transport for the elevated Brand entity (persona + palette +
// typography + 5 logo slots + completeness rubric). Wraps the brain /brandkits
// routes. Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.
//
// A Brand is the existing Brand Kit enriched: `roles` stays the compositing
// contract; the rich fields drive the Brand tab + the completeness rubric. A brand
// is `live` (Composer-usable) only when all 5 logo slots are filled.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export type ColorRole = 'primary' | 'secondary' | 'neutral' | 'accent';
export type LogoSlot = 'mark' | 'wordmark' | 'lockupColor' | 'lockupDark' | 'lockupLight';
export const LOGO_SLOTS: LogoSlot[] = ['mark', 'wordmark', 'lockupColor', 'lockupDark', 'lockupLight'];
export const LOGO_SLOT_LABELS: Record<LogoSlot, string> = {
  mark: 'Logo mark', wordmark: 'Wordmark', lockupColor: 'Full-color lockup',
  lockupDark: 'Dark-mode lockup', lockupLight: 'Light-mode lockup',
};

export interface PaletteSwatch { name?: string; hex: string; role: ColorRole; shade?: 'base' | 'alt'; pinned?: boolean }
export interface BrandPersona { voice?: string; description?: string; tone?: string }
export interface BrandTypography { primary?: string | null; secondary?: string | null; accent?: string | null; sources?: string[] }
export interface LogoRef { assetId?: string; path?: string; variant?: string; kind?: string }

export interface BrandCompletenessGap {
  field: 'logo' | 'colors' | 'fonts' | 'voice';
  message: string;
  canGenerate?: boolean;
  blocks: 'live' | 'complete';
}

export interface Brand {
  brand_kit_id: string;
  name: string;
  builtin?: boolean;
  roles: Record<string, unknown>;
  persona: BrandPersona;
  palette: PaletteSwatch[];
  typography: BrandTypography;
  logo: Partial<Record<LogoSlot, LogoRef>>;
  files: string[];
  status: 'draft' | 'live';
  tier: 'incomplete' | 'partial' | 'complete';
  missing: BrandCompletenessGap[];
  score?: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the brand service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brand service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export function listBrands(opts: { liveOnly?: boolean } = {}): Promise<Brand[]> {
  return req<Brand[]>(`/brandkits${opts.liveOnly ? '?liveOnly=1' : ''}`);
}
export function getBrand(id: string): Promise<Brand> { return req<Brand>(`/brandkits/${encodeURIComponent(id)}`); }
export function createBrand(payload: { name: string }): Promise<Brand> {
  return req<Brand>('/brandkits/create', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateBrand(id: string, patch: {
  name?: string; persona?: BrandPersona; palette?: PaletteSwatch[]; typography?: BrandTypography;
  logo?: Partial<Record<LogoSlot, LogoRef>>; roles?: Record<string, unknown>;
}): Promise<Brand> {
  return req<Brand>('/brandkits/update', { method: 'POST', body: JSON.stringify({ id, patch }) });
}
/** Attach an uploaded asset to a logo slot (or a brand file when slot is omitted). */
export function addBrandFile(id: string, payload: { slot?: LogoSlot; assetId?: string; path?: string; kind?: string }): Promise<Brand> {
  return req<Brand>('/brandkits/addFile', { method: 'POST', body: JSON.stringify({ id, ...payload }) });
}
export function deleteBrand(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>('/brandkits/delete', { method: 'POST', body: JSON.stringify({ id }) });
}
export interface BrandExtract { palette: PaletteSwatch[]; typography: BrandTypography; persona: BrandPersona }
/** Normalize pasted brand info → { palette, typography, persona } (apply with updateBrand). */
export function extractBrand(text: string): Promise<BrandExtract> {
  return req<BrandExtract>('/brand/extract', { method: 'POST', body: JSON.stringify({ text }) });
}
/** Extract brand info from an UPLOADED image (logo / brand board / palette) via vision. */
export function extractBrandFromAsset(assetId: string, kind?: string): Promise<BrandExtract> {
  return req<BrandExtract>('/brand/extract', { method: 'POST', body: JSON.stringify({ assetId, kind }) });
}

// AI-assist gap-fillers — each applies to the brand and returns the updated Brand.
function assist(kind: string, id: string): Promise<Brand> {
  return req<Brand>(`/brand/assist/${kind}`, { method: 'POST', body: JSON.stringify({ id }) });
}
export const completeBrandPalette = (id: string) => assist('palette', id); // $0
export const suggestBrandFonts = (id: string) => assist('fonts', id);      // $0
export const draftBrandVoice = (id: string) => assist('voice', id);        // cheap text
export const generateBrandLogos = (id: string) => assist('logo', id);      // PAID — image credits

/** Resolve a logo ref to a viewable URL (uploaded asset → brain /assets; else null for built-in variants). */
export function logoUrl(ref?: LogoRef): string | null {
  if (!ref) return null;
  if (ref.path) return `${base()}/assets/${ref.path.replace(/^.*\/assets\//, '')}`;
  if (ref.assetId) return `${base()}/assets/uploads/${ref.assetId}.${ref.kind || 'png'}`;
  if (ref.variant) return `${base()}/brand/logo/${encodeURIComponent(ref.variant)}`; // built-in SVG keys
  return null;
}
