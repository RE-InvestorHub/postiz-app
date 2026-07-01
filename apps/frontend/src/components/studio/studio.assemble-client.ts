// Assemble client — transport for the Audio Studio's sound generation + soundtrack assembly (Plan 3).
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init }); }
  catch (err: unknown) { throw new Error(`Could not reach the audio service: ${(err as Error)?.message ?? String(err)}`); }
  if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Audio service responded ${res.status}${d ? `: ${d}` : ''}`); }
  return (await res.json().catch(() => ({}))) as T;
}

export interface SfxItem { id: string; file: string; label: string; kind: string; durationS: number; builtin?: boolean }
export interface JamendoTrack {
  jamendoId: string; name: string; artist: string; durationS: number; audioUrl: string;
  image?: string; tags?: string[]; ccLicenseUrl?: string; commercialUse: boolean; proLicensable: boolean; proUrl?: string;
}
export interface AssembleSpec {
  music?: { source: 'local' | 'jamendo' | 'elevenlabs' | 'none'; bedId?: string; mood?: string; bpm?: number; assetId?: string; gainDb?: number; duckRatio?: number };
  sfx?: { fromScriptCues?: boolean; extra?: Array<{ sfxId?: string; assetId?: string; atS: number; gainDb?: number }> };
  masterGainDb?: number;
}
export interface AssembleResult { id: string; url: string; durationS: number; sfxCount: number; hasMusic: boolean }

/** Curated SFX library (free). */
export function listSfxLibrary(): Promise<{ sfx: SfxItem[] }> { return req('/sfx/library'); }
/** Generate a bespoke SFX (ElevenLabs text-to-SFX). SPENDS → gate at the call site. */
export function generateSfx(payload: { text: string; durationSeconds?: number }): Promise<{ id: string; url: string; label: string }> {
  return req('/sfx/generate', { method: 'POST', body: JSON.stringify(payload) });
}
/** Search the Jamendo catalog (free; needs JAMENDO_CLIENT_ID → `configured:false` otherwise). */
export function searchJamendo(params: { query?: string; tags?: string; limit?: number }): Promise<{ configured: boolean; tracks: JamendoTrack[]; note?: string }> {
  const q = new URLSearchParams();
  if (params.query) q.set('query', params.query);
  if (params.tags) q.set('tags', params.tags);
  if (params.limit) q.set('limit', String(params.limit));
  return req(`/music/jamendo/search?${q.toString()}`);
}
/** Cache a picked Jamendo track locally → a music asset for assembly (free). */
export function pickJamendo(id: string): Promise<{ id: string; url: string; name: string; artist: string; durationS: number; commercialUse: boolean; proLicensable: boolean }> {
  return req('/music/jamendo/pick', { method: 'POST', body: JSON.stringify({ id }) });
}
/** Generate a bespoke music bed (ElevenLabs Music). SPENDS → gate at the call site. */
export function generateMusic(payload: { prompt: string; lengthMs?: number }): Promise<{ id: string; url: string; durationS: number }> {
  return req('/music/generate', { method: 'POST', body: JSON.stringify(payload) });
}
/** Assemble a script's soundtrack (VO + SFX cues + ducked music) → one master. FREE (local ffmpeg). */
export function assembleScript(payload: { scriptId: string; spec?: AssembleSpec }): Promise<AssembleResult> {
  return req('/audio/assemble', { method: 'POST', body: JSON.stringify(payload) });
}
