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
