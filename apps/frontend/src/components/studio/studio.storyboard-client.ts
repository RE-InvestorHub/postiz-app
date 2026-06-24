// Storyboard generation transport — the bridge from the Studio Create button
// (and the studio.assembleVideo capability) to the workspace brain's storyboard
// assembly endpoint.
//
// POSTs to NEXT_PUBLIC_BRAIN_URL/storyboard (or /api/brain/storyboard if the
// same-origin proxy is in place). When the endpoint is not yet running the call
// fails gracefully and the caller surfaces the error in the UI rather than
// crashing.
//
// The storyboard engine itself is a sibling task (`storyboard-engine`). Wiring
// this call here — and exposing it through the capability registry — is what
// THIS task delivers. The server-side handler may 404 until that task ships; all
// callers handle that via the returned `StoryboardResult.error` field.

import { StudioResult } from '@gitroom/frontend/components/studio/studio.types';

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

export interface StoryboardRequest {
  /** The completed content brief collected by the agent. */
  brief: Record<string, unknown>;
  /** Storyboard slot contents at time of submission (may be partial). */
  slots: Array<StudioResult | null>;
}

export interface StoryboardResult {
  ok: boolean;
  /** Job/task id returned by the storyboard service (if successful). */
  jobId?: string;
  /** Human-readable outcome message — for both success and error. */
  message: string;
}

/**
 * Submit a brief + slot snapshot to the workspace brain for storyboard assembly.
 *
 * Safe to call before the storyboard endpoint is live — a 404 / connection
 * error returns { ok: false, message } instead of throwing.
 */
export async function submitStoryboard(
  req: StoryboardRequest
): Promise<StoryboardResult> {
  const url = `${BRAIN_BASE.replace(/\/+$/, '')}/storyboard`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // 404 = storyboard engine not yet deployed; report gracefully.
      if (res.status === 404) {
        return {
          ok: false,
          message:
            'Storyboard engine not yet available (404). The brief has been captured — generation will be possible once the service is deployed.',
        };
      }
      return {
        ok: false,
        message: `Storyboard service responded with ${res.status}${detail ? `: ${detail}` : ''}.`,
      };
    }

    const data = await res.json().catch(() => ({}));
    return {
      ok: true,
      jobId: data?.jobId ?? data?.id,
      message: data?.message ?? 'Storyboard queued.',
    };
  } catch (err: unknown) {
    // Network error (service not running, CORS, etc.)
    const msg = (err as Error)?.message ?? String(err);
    return {
      ok: false,
      message: `Could not reach storyboard service: ${msg}`,
    };
  }
}
