// Pipeline client — transport for the Video composer's async generation flow.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.
//
// Flow: estimate → plan (brief→storyboard from the Ad) → startRun → pollRun
// (per-shot review: accept / regen) → assemble → per-format short. Reuses the
// brain's existing /pipeline/* engine; /compose/video/{estimate,plan} are the
// only video-composer-specific routes.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface CostEstimate { model: string; perShotCredits: number; shots: number; total: number }

export interface PipelineShot {
  shotId: string;
  beat?: string;
  shotNumber?: number;
  status: 'pending' | 'generating' | 'awaiting_review' | 'accepted' | 'regenerating' | 'error';
  clipUrl: string | null;
  clipLocalPath?: string | null;
  model?: string;
  feedback?: string | null;
  error?: string | null;
}

export interface PipelineRun {
  runId: string;
  status: 'pending' | 'generating' | 'quality_gate' | 'assembling' | 'done' | 'error';
  shots: PipelineShot[];
  renders?: Array<{ format: string; url?: string; localPath?: string }>;
  error?: string | null;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the video service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Video service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

// --- Video-composer routes ---
export function estimateVideo(p: { model?: string; shots?: number; durationS?: number }): Promise<CostEstimate> {
  const q = new URLSearchParams();
  if (p.model) q.set('model', p.model);
  if (p.shots) q.set('shots', String(p.shots));
  if (p.durationS) q.set('durationS', String(p.durationS));
  return req<CostEstimate>(`/compose/video/estimate?${q.toString()}`);
}

export interface PlanResult { brief: any; storyboard: any; validation?: any }
export function planVideo(payload: {
  adId?: string; core_message: string; goal?: string; target_audience?: string;
  product_or_offer?: string; cta?: string; format?: string; aspect_ratio?: string;
  distribution_channel?: string; visual_style?: string; character_reference?: string;
}): Promise<PlanResult> {
  return req<PlanResult>('/compose/video/plan', { method: 'POST', body: JSON.stringify(payload) });
}

// --- Reused /pipeline/* engine ---
export interface VoiceSettings { stability?: number; style?: number; similarity_boost?: number; use_speaker_boost?: boolean }
export interface MusicSpec { bedId?: string; mood?: string; bpm?: number; volume?: number; duckRatio?: number }
export function startRun(payload: {
  storyboard: any; platforms?: string[]; renderFormats?: string[]; voiceId?: string; dryRun?: boolean;
  voiceTone?: string; voiceSettings?: VoiceSettings; music?: MusicSpec;
  // Plan 2 — an Ad-bound rendered audio track to use as the spot audio in place of per-shot VO.
  boundAudioUrl?: string;
}): Promise<{ runId: string } & Partial<PipelineRun>> {
  return req('/pipeline/run', { method: 'POST', body: JSON.stringify(payload) });
}
export function pollRun(runId: string): Promise<PipelineRun> {
  return req<PipelineRun>(`/pipeline/job/${encodeURIComponent(runId)}`);
}
export function acceptShot(payload: { runId: string; shotId: string }): Promise<PipelineRun> {
  return req<PipelineRun>('/pipeline/shot/accept', { method: 'POST', body: JSON.stringify(payload) });
}
export function regenShot(payload: { runId: string; shotId: string; field?: string; value?: string; feedback?: string }): Promise<PipelineRun> {
  return req<PipelineRun>('/pipeline/shot/regen', { method: 'POST', body: JSON.stringify(payload) });
}
export function assembleRun(payload: { runId: string; dryRun?: boolean }): Promise<PipelineRun> {
  return req<PipelineRun>('/pipeline/assemble', { method: 'POST', body: JSON.stringify(payload) });
}

// Build a viewable URL for a brain /assets path or an absolute CDN url.
export function clipUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `${base()}/assets/${String(pathOrUrl).replace(/^\/+/, '')}`;
}
