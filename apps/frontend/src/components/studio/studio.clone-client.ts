// Clone client — transport from the Avatars tab to the workspace brain's
// /clone/* routes (consent, registry library, create, drive/lip-sync, status).
//
// Same-origin via NEXT_PUBLIC_BRAIN_URL (or the /api/brain dev/nginx proxy),
// mirroring studio.storyboard-client.ts / studio.upload-client.ts. Thin
// transport only — no business logic; the consent hard-gate lives in the brain.

import {
  CloneRecord,
  CloneStatus,
  AvatarConsentDraft,
} from '@gitroom/frontend/components/studio/studio.types';

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string {
  return BRAIN_BASE.replace(/\/+$/, '');
}

/** Shared JSON request with consistent error surfacing (throws on non-2xx). */
async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    });
  } catch (err: unknown) {
    throw new Error(`Could not reach the clone service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Clone service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
}

// ---------------------------------------------------------------------------
// Library (read)
// ---------------------------------------------------------------------------

/** List registered clones, optionally filtered by lifecycle status. */
export function listClones(status?: CloneStatus): Promise<CloneRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return req<CloneRecord[]>(`/clone/list${qs}`);
}

/** Fetch a single clone record by id. */
export function getClone(cloneId: string): Promise<CloneRecord> {
  return req<CloneRecord>(`/clone/get/${encodeURIComponent(cloneId)}`);
}

// ---------------------------------------------------------------------------
// Consent + creation (onboarding wizard)
// ---------------------------------------------------------------------------

export interface ConsentRecordResponse {
  consent_id: string;
  [k: string]: unknown;
}

/**
 * Record documented consent (step 1 of onboarding). The brain stores it and
 * returns a consent id that createClone() must reference. consent_ref (a link/
 * ID to the written consent) is REQUIRED — the brain rejects records without it.
 */
export function recordConsent(payload: {
  consent_id?: string;
  person: string;
  document_ref: string;
  scope: {
    visual_likeness: boolean;
    voice: boolean;
    channels: string[];
    duration: string;
    commercial_use: boolean;
  };
  verification?: { status?: string; method?: string };
}): Promise<ConsentRecordResponse> {
  return post<ConsentRecordResponse>('/clone/consent/record', payload);
}

/** Mark a consent record verified (human-gated step). */
export function verifyConsent(consentId: string, details?: Record<string, unknown>): Promise<unknown> {
  return post('/clone/consent/verify', { consentId, ...details });
}

/** Build + register a clone. Refuses without a valid consent reference. */
export function createClone(payload: {
  cloneId: string;
  person: string;
  consentId: string;
  photos: string[];
  voiceSamples?: string[];
  skipVoice?: boolean;
  styleTokens?: Record<string, string>;
  notes?: string;
}): Promise<CloneRecord> {
  return post<CloneRecord>('/clone/create', payload);
}

// ---------------------------------------------------------------------------
// Drive / lip-sync (casting)
// ---------------------------------------------------------------------------

/** Drive a stored clone with a new script (routes to the right lip-sync engine). */
export function driveClone(payload: Record<string, unknown>): Promise<unknown> {
  return post('/clone/drive', payload);
}

/** Kling lip-sync (≤10s clips). */
export function lipsyncKling(payload: Record<string, unknown>): Promise<unknown> {
  return post('/clone/lipsync/kling', payload);
}

/** Hedra lip-sync (long-form). */
export function lipsyncHedra(payload: Record<string, unknown>): Promise<unknown> {
  return post('/clone/lipsync/hedra', payload);
}

// ---------------------------------------------------------------------------
// Lifecycle (library management)
// ---------------------------------------------------------------------------

/** Change a clone's lifecycle status (active | suspended | revoked). */
export function setCloneStatus(cloneId: string, status: CloneStatus, reason?: string): Promise<CloneRecord> {
  return post<CloneRecord>('/clone/status', { cloneId, status, reason });
}

/** Revoke a clone (status → revoked). Revoked clones are no longer castable. */
export function revokeClone(cloneId: string, reason?: string): Promise<CloneRecord> {
  return post<CloneRecord>('/clone/revoke', { cloneId, reason });
}

/** Helper for callers that build a consent payload from the wizard draft. */
export function consentPayloadFromDraft(draft: AvatarConsentDraft, consentId: string) {
  return {
    consent_id: consentId,
    person: draft.person,
    document_ref: draft.consent_ref,
    scope: {
      visual_likeness: draft.consent_type !== 'voice',
      voice: draft.consent_type !== 'visual',
      channels: draft.consent_channels,
      duration: draft.consent_expires,
      commercial_use: true,
    },
    verification: { status: 'pending', method: 'signed_doc' },
  };
}
