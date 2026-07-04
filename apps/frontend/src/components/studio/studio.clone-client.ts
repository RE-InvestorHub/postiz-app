// Clone client — transport from the Avatars tab to the workspace brain's
// /clone/* routes (consent, registry library, create, drive/lip-sync, status).
//
// Same-origin via NEXT_PUBLIC_BRAIN_URL (or the /api/brain dev/nginx proxy),
// mirroring studio.storyboard-client.ts / studio.upload-client.ts. Thin
// transport only — no business logic; the consent hard-gate lives in the brain.

import {
  CloneRecord,
  CloneStatus,
  CloneTier,
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
  /** 'ivc' = instant (immediate), 'pvc' = professional (verification + training). */
  cloneTier?: CloneTier;
  /** A STOCK voice id to assign (no cloning) — the full-parity default. */
  voiceId?: string;
  /** Kick off async Higgsfield Soul training from the real photos (spinner → ready). */
  trainSoul?: boolean;
  styleTokens?: Record<string, string>;
  notes?: string;
}): Promise<CloneRecord> {
  return post<CloneRecord>('/clone/create', payload);
}

export interface VoiceStatus {
  status: string;
  ready: boolean;
  [k: string]: unknown;
}

/** Poll the training/verification status of a cloned voice (PVC). */
export function getVoiceStatus(voiceId: string): Promise<VoiceStatus> {
  return req<VoiceStatus>(`/clone/voice/status/${encodeURIComponent(voiceId)}`);
}

// ---------------------------------------------------------------------------
// Drive / lip-sync (casting)
// ---------------------------------------------------------------------------

/** Drive a stored clone with a new script (routes to the right lip-sync engine). */
export function driveClone(payload: Record<string, unknown>): Promise<unknown> {
  return post('/clone/drive', payload);
}

/** Kling lip-sync (≤10s clips). Long-form routing now goes through HeyGen via driveClone. */
export function lipsyncKling(payload: Record<string, unknown>): Promise<unknown> {
  return post('/clone/lipsync/kling', payload);
}

export interface CloneCastJob {
  status: 'casting' | 'done' | 'error';
  result?: { clipAssetId?: string; publicUrl?: string; engine?: string; stub?: boolean; durationS?: number };
  error?: string;
}

// A swappable backdrop for the cast — composite the matted avatar onto it (HeyGen-style bg swap).
export interface AvatarBackground {
  type: 'color' | 'gradient' | 'image';
  color?: string;
  colors?: string[];      // 2 stops for a gradient
  imageAssetId?: string;
  imageUrl?: string;
}

// A cast is driven by a script (→ TTS in the avatar's voice) OR a provided audio clip (record / upload
// / Writer's-Room track → lip-sync). audioContentTypes lets the caller declare a cloned-voice mirror.
export interface CloneCastPayload {
  cloneId: string;
  script?: string;
  engine?: string;
  aspectRatio?: string;
  audioAssetId?: string;
  audioUrl?: string;
  audioContentTypes?: string[];
  background?: AvatarBackground;
}

/** Matte the avatar's portrait (rembg, cached, FREE) → a transparent PNG URL for the instant bg preview. */
export function matteAvatar(kind: 'synthetic' | 'human', id: string): Promise<{ ok: boolean; matteUrl: string }> {
  return post('/avatar/matte', { kind, id });
}

/** ✨ Develop the lines with AI — plain spoken text for an avatar to say (Avatars canvas). Cheap. */
export function developAvatarLines(payload: { prompt: string; avatarName?: string; brandKitId?: string; maxWords?: number; existing?: string }): Promise<{ lines: string }> {
  return post('/avatar/develop-lines', payload);
}

/** Cast a Soul-ready clone as a talking-head (script→TTS or BYO audio → lip-sync → Video Library). */
export function castClone(payload: CloneCastPayload): Promise<{ jobId: string; status: string }> {
  return post('/clone/cast', payload);
}

export function cloneCastStatus(jobId: string): Promise<CloneCastJob> {
  return req<CloneCastJob>(`/clone/cast/status?jobId=${encodeURIComponent(jobId)}`);
}

/** Cast + poll to completion (up to ~6 min). */
export async function castCloneAndWait(payload: CloneCastPayload): Promise<CloneCastJob> {
  const { jobId } = await castClone(payload);
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await cloneCastStatus(jobId);
    if (s.status === 'done' || s.status === 'error') return s;
  }
  return { status: 'error', error: 'cast timed out' };
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

/** Hard-delete a clone (Avatars bulk delete). Consent record is left intact. */
export function deleteClone(cloneId: string): Promise<{ deleted: boolean; clone_id: string }> {
  return post('/clone/delete', { cloneId });
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

// ---------------------------------------------------------------------------
// Onboarding drafts (resumable wizard state) + consent cleanup
// ---------------------------------------------------------------------------

export interface DraftAssetRef { assetId: string; url: string; filename: string }

/** A saved-in-progress avatar wizard run (NOT a clone). */
export interface AvatarDraft {
  draft_id: string;
  person: string;
  step: number;
  tier: CloneTier;
  wants_voice: boolean;
  consent_type: string;
  consent_id: string | null;
  consent: AvatarConsentDraft | null;
  likeness: DraftAssetRef[];
  voice: DraftAssetRef[];
  brand_kit_id: string;
  created_at: string;
  updated_at: string;
}

/** Fields the wizard sends on auto-save (camelCase; the brain merges onto the stored draft). */
export interface SaveDraftInput {
  draftId?: string;
  person?: string;
  step?: number;
  tier?: CloneTier;
  wantsVoice?: boolean;
  consentType?: string;
  consentId?: string | null;
  consent?: AvatarConsentDraft | null;
  likeness?: DraftAssetRef[];
  voice?: DraftAssetRef[];
  brandKitId?: string;
}

/** In-progress drafts for the active brand, newest first. */
export function listAvatarDrafts(brandKitId?: string): Promise<AvatarDraft[]> {
  const qs = brandKitId ? `?brandKitId=${encodeURIComponent(brandKitId)}` : '';
  return req<{ drafts: AvatarDraft[] }>(`/avatar/drafts${qs}`).then((r) => r.drafts || []);
}

/** Load one draft to resume it. */
export function getAvatarDraft(draftId: string): Promise<AvatarDraft> {
  return req<AvatarDraft>(`/avatar/drafts/get/${encodeURIComponent(draftId)}`);
}

/** Auto-save (upsert) the wizard's current state. Returns the saved draft (with its draft_id). */
export function saveAvatarDraft(input: SaveDraftInput): Promise<AvatarDraft> {
  return post<AvatarDraft>('/avatar/drafts/save', input);
}

/** Abandon a draft (keeps its consent + uploaded assets). */
export function deleteAvatarDraft(draftId: string): Promise<{ deleted: boolean; draft_id: string }> {
  return post('/avatar/drafts/delete', { draftId });
}

/** Purge a whole run: the draft + its consent record + its uploaded likeness/voice assets. */
export function purgeAvatarDraft(draftId: string): Promise<{ deleted: boolean; draft_id: string; assetsDeleted: number; consentDeleted: boolean }> {
  return post('/avatar/drafts/purge', { draftId });
}

/** Hard-delete a consent record (cleanup). Server refuses if a live clone references it. */
export function deleteConsent(consentId: string, force = false): Promise<{ deleted: boolean; consent_id: string }> {
  return post('/clone/consent/delete', { consentId, force });
}

export interface ConsentSummary {
  consent_id: string;
  person: string;
  status: string;
  channels: string[];
  revoked: boolean;
  created_at: string | null;
}

/** List consent records for the cleanup UI, newest first. */
export function listConsentRecords(): Promise<ConsentSummary[]> {
  return req<{ records: ConsentSummary[] }>('/clone/consent/list').then((r) => r.records || []);
}

/** Full stored consent record — used to reconstruct the wizard's consent form when resuming. */
export interface FullConsentRecord {
  consent_id: string;
  person: string;
  document_ref: string;
  scope?: { visual_likeness?: boolean; voice?: boolean; channels?: string[]; duration?: string; commercial_use?: boolean };
  verification?: { status?: string };
}

export function getConsentRecord(consentId: string): Promise<FullConsentRecord> {
  return req<FullConsentRecord>(`/clone/consent/${encodeURIComponent(consentId)}`);
}
