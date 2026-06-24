// Remotion render-service transport — the bridge between the Studio Video Editor
// panel and the workspace brain's proxied render endpoints.
//
// The render service runs at :4011.  The Postiz frontend must NOT call :4011
// directly (CORS + port-forwarding concerns).  Instead, every call goes through
// the same-origin proxy that the brain exposes via `/api/brain/render/*`.
//
// Brain endpoints needed (to be added in `brain/`):
//
//   GET  /render/compositions
//       → proxies to :4011/compositions
//       → returns { compositions: CompositionMeta[] }
//
//   GET  /render/formats
//       → proxies to :4011/formats
//       → returns { formats: FormatMap }
//
//   POST /render/job
//       → proxies to :4011/render
//       → body: { compositionId, format, props }
//       → returns { jobId, status, poll }
//
//   GET  /render/job/:id
//       → proxies to :4011/jobs/:id
//       → returns { jobId, status, outputUrl?, error? }
//
// When the proxy is not yet live a 404 / connection error returns gracefully
// rather than throwing (consistent with the storyboard-client pattern).

// ---------------------------------------------------------------------------
// Base URL — same pattern as studio.storyboard-client
// ---------------------------------------------------------------------------
const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

const renderBase = () => `${BRAIN_BASE.replace(/\/+$/, '')}/render`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single prop field descriptor from compositions.mjs `schema`. */
export interface PropFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'array';
  label: string;
  nullable?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Only present when type === 'array' */
  items?: Record<string, PropFieldSchema>;
}

/** Per-composition metadata returned by GET /compositions. */
export interface CompositionMeta {
  id: string;
  label: string;
  description: string;
  defaultFormat: string;
  fps: number;
  durationInFrames: number;
  defaultProps: Record<string, unknown>;
  /** If schema is empty `{}`, the composition has no user-facing props. */
  schema: Record<string, PropFieldSchema>;
}

/** Format descriptor returned by GET /formats. */
export interface FormatMeta {
  width: number;
  height: number;
  label: string;
  platforms: string[];
}

/** Job status returned by GET /render/job/:id. */
export interface RenderJobStatus {
  jobId: string;
  status: 'queued' | 'rendering' | 'done' | 'error';
  outputUrl?: string;
  srtUrl?: string;
  vttUrl?: string;
  error?: string;
  /** Fraction 0–1, populated while rendering (if the service supports it). */
  progress?: number;
}

/** Enqueue render request body. */
export interface RenderRequest {
  compositionId: string;
  format: string;
  props: Record<string, unknown>;
}

/** Enqueue render response (202). */
export interface RenderEnqueueResult {
  ok: boolean;
  jobId?: string;
  message: string;
}

// ---------------------------------------------------------------------------
// Transport helpers
// ---------------------------------------------------------------------------

async function safeFetch<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all available compositions and their prop schemas.
 * Returns null if the render proxy is not yet reachable.
 */
export async function fetchCompositions(): Promise<CompositionMeta[] | null> {
  const data = await safeFetch<{ compositions: CompositionMeta[] }>(
    `${renderBase()}/compositions`
  );
  return data?.compositions ?? null;
}

/**
 * Fetch per-platform format options (feed / reels / youtube).
 * Returns null if the proxy is not reachable.
 */
export async function fetchFormats(): Promise<Record<string, FormatMeta> | null> {
  const data = await safeFetch<{ formats: Record<string, FormatMeta> }>(
    `${renderBase()}/formats`
  );
  return data?.formats ?? null;
}

/**
 * Enqueue a render job via the brain proxy.
 *
 * Safe to call before the proxy is live — returns { ok: false, message }
 * instead of throwing.
 */
export async function enqueueRender(req: RenderRequest): Promise<RenderEnqueueResult> {
  try {
    const res = await fetch(`${renderBase()}/job`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      if (res.status === 404) {
        return {
          ok: false,
          message:
            'Render proxy not yet available (404). The render service endpoint needs to be added to the brain. See studio.remotion-client.ts for the required routes.',
        };
      }
      return {
        ok: false,
        message: `Render service responded with ${res.status}${detail ? `: ${detail}` : ''}.`,
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      jobId: data?.jobId,
      message: data?.message ?? `Job queued (${data?.jobId}).`,
    };
  } catch (err: unknown) {
    const msg = (err as Error)?.message ?? String(err);
    return { ok: false, message: `Could not reach render service: ${msg}` };
  }
}

/**
 * Poll a render job's status.
 * Returns null if the proxy is unreachable or the job is not found.
 */
export async function pollRenderJob(jobId: string): Promise<RenderJobStatus | null> {
  return safeFetch<RenderJobStatus>(`${renderBase()}/job/${jobId}`);
}
