// Voice client — transport for the Audio-tab voice library + VO generation.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain), mirroring the other studio
// clients. Thin transport only.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string {
  return BRAIN_BASE.replace(/\/+$/, '');
}

export type VoiceSource = 'brand' | 'clone' | 'elevenlabs';

export interface VoiceOption {
  voiceId: string;
  label: string;
  source: VoiceSource;
  cloneId?: string;
  tier?: string;
  ready: boolean;
  /** A hosted sample MP3 (ElevenLabs voices) — free to play for auditioning. */
  previewUrl?: string | null;
}

export interface GeneratedVO {
  id: string;
  url: string;
  voiceId: string;
  alignment?: unknown;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the voice service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Voice service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** The unified selectable voice library (brand + ready clone voices + EL account). */
export function listVoiceLibrary(): Promise<VoiceOption[]> {
  return req<VoiceOption[]>('/voices/library');
}

/** Generate a VO clip with a chosen voice (real TTS → audio asset + alignment). */
export function generateVO(payload: { text: string; voiceId: string; modelId?: string }): Promise<GeneratedVO> {
  return req<GeneratedVO>('/studio/audio', { method: 'POST', body: JSON.stringify(payload) });
}

/**
 * Render a whole structured Script as a single-narrator VO (the Writer's Room "hear it" preview).
 * The brain flattens beats → lines in order and applies the script's pronunciation overrides.
 * Per-character casting is Plan 2. Paid TTS — call only from an explicit user action.
 */
export function generateVOFromScript(payload: { scriptId: string; voiceId: string; modelId?: string }): Promise<GeneratedVO & { scriptId: string; scriptUpdatedAt?: string }> {
  return req('/studio/audio/from-script', { method: 'POST', body: JSON.stringify(payload) });
}

/** The latest generated VO for a script (persisted on disk), so the panel reloads it after navigation. */
export function latestVOForScript(scriptId: string): Promise<{ id: string | null; url: string | null }> {
  return req(`/studio/audio/for-script?scriptId=${encodeURIComponent(scriptId)}`);
}

// ── Plan 2 — multi-voice render + Audio Library + Voice Mirror ────────────────

export interface RenderCost { lines: number; chars: number; credits: number; words: number; estSeconds: number; voicesUsed: string[] }
export interface AudioWordSpan { word: string; start: number; end: number }
export interface AudioLineSpan { lineId: string; beatId?: string; characterId: string | null; characterName?: string; voiceId: string | null; tone?: string; text?: string; start: number; end: number; words?: AudioWordSpan[] }
export interface AudioTrack {
  id: string; url: string; stage: string; scriptId: string | null; scriptName?: string | null;
  brandKitId: string; provenance?: string | null; durationS?: number | null; voicesUsed?: string[] | null;
  lineSpans?: AudioLineSpan[] | null; voiceId?: string | null; text?: string | null;
  srtUrl?: string | null; vttUrl?: string | null; dryRun?: boolean; createdAt?: string | null;
}
export interface RenderStarted { jobId: string; status: 'rendering'; cost?: RenderCost }
export interface RenderResult {
  id: string; url: string; durationS: number; lineSpans: AudioLineSpan[]; voicesUsed: string[];
  srtUrl: string | null; vttUrl: string | null; dryRun?: boolean; cost?: RenderCost;
}
export interface RenderJob {
  status: 'rendering' | 'done' | 'error'; kind?: string; progress?: { done: number; total: number; lineId?: string };
  result?: RenderResult; error?: string;
}

/** Multi-voice render. dryRun:true → synchronous cost preview + silent stub (no spend). Real → job.
 *  `voiceId` = the house/narrator voice (fallback for uncast lines). */
export function renderScriptAudio(payload: { scriptId: string; brandKitId?: string; modelId?: string; dryRun?: boolean; voiceId?: string }): Promise<RenderResult | RenderStarted> {
  return req('/studio/audio/render', { method: 'POST', body: JSON.stringify(payload) });
}
export function audioRenderStatus(jobId: string): Promise<RenderJob> {
  return req(`/studio/audio/render/status?jobId=${encodeURIComponent(jobId)}`);
}
/** Re-render ONE line of an existing track + splice back in (the only line that spends). Async. */
export function renderAudioLine(payload: { trackId: string; lineId: string; modelId?: string }): Promise<RenderStarted> {
  return req('/studio/audio/render/line', { method: 'POST', body: JSON.stringify(payload) });
}
export function listAudioLibrary(brandKitId?: string): Promise<{ tracks: AudioTrack[] }> {
  return req(`/audio/library${brandKitId ? `?brandKitId=${encodeURIComponent(brandKitId)}` : ''}`);
}
export function deleteAudioTrack(id: string): Promise<{ ok: boolean; deleted: number }> {
  return req('/audio/delete', { method: 'POST', body: JSON.stringify({ id }) });
}
/** Voice Mirror (speech-to-speech): convert a recorded clip into a target voice. SPENDS. */
export function mirrorVoice(payload: { srcUrl: string; voiceId: string; scriptId?: string; brandKitId?: string; modelId?: string }): Promise<{ id: string; url: string; voiceId: string; scriptId: string | null }> {
  return req('/studio/audio/mirror', { method: 'POST', body: JSON.stringify(payload) });
}

/** Poll a render job to completion (used by the render bar + line re-render). */
export async function pollAudioRender(jobId: string, onProgress?: (p: { done: number; total: number }) => void, intervalMs = 1200, timeoutMs = 600000): Promise<RenderResult> {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await audioRenderStatus(jobId);
    if (job.progress && onProgress) onProgress(job.progress);
    if (job.status === 'done' && job.result) return job.result;
    if (job.status === 'error') throw new Error(job.error || 'Render failed.');
    if (Date.now() - started > timeoutMs) throw new Error('Render timed out.');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
