// Shared types for the Studio control surface.
// The store, the action/capability layer, and the UI all speak these.

import type { TimelineEDL } from '@gitroom/frontend/components/studio/timeline/timeline.contract';

export type StudioTab = 'images' | 'video' | 'audio' | 'editor' | 'avatars' | 'project' | 'composer' | 'brand';

// ---------------------------------------------------------------------------
// Avatars (person-clone library + consent onboarding)
// Mirrors the brain registry record (services/brain/lib/registry.mjs). The clone
// client (studio.clone-client.ts) and the Avatars tab UI both speak these.
// ---------------------------------------------------------------------------

export type CloneStatus = 'active' | 'suspended' | 'revoked';
export type CloneTier = 'ivc' | 'pvc';
export type ConsentType = 'visual' | 'voice' | 'both';

/** A registered clone identity as stored in the brain registry. */
export interface CloneRecord {
  clone_id: string;
  person: string;
  /** REQUIRED — reference to documented written consent. */
  consent_ref: string;
  consent_type?: ConsentType;
  consent_channels?: string[];
  consent_expires?: string; // ISO8601 or 'perpetual'
  status: CloneStatus;
  visual_identity?: {
    provider?: string;
    soul_id?: string;
    reference_images?: string[];
    reference_sheet_id?: string;
    character_seed?: number;
  };
  voice?: {
    provider?: string;
    voice_id?: string;
    clone_tier?: CloneTier;
  };
  style_tokens?: Record<string, string>;
  notes?: string;
  created_at?: string;
  updated_at?: string;
  revoke_reason?: string;
}

/** Consent fields collected in step 1 of the onboarding wizard. */
export interface AvatarConsentDraft {
  person: string;
  consent_type: ConsentType;
  consent_channels: string[];
  consent_expires: string; // ISO date or 'perpetual'
  /** REQUIRED to create — link/ID to the documented written consent. */
  consent_ref: string;
}

/** Transient state of the consent-gated onboarding wizard. */
export interface AvatarOnboardingState {
  open: boolean;
  step: number; // 0..3 (consent → likeness → voice → review)
  consent: AvatarConsentDraft;
  /** Set after the brain records consent (POST /clone/consent/record). */
  consentId?: string;
  /** Uploaded likeness asset ids (step 2). */
  likenessAssetIds: string[];
  /** Uploaded voice-sample asset ids (step 3). */
  voiceAssetIds: string[];
  creating?: boolean;
  error?: string;
}

export const emptyConsentDraft: AvatarConsentDraft = {
  person: '',
  consent_type: 'both',
  consent_channels: [],
  consent_expires: 'perpetual',
  consent_ref: '',
};

// ---------------------------------------------------------------------------
// User-uploaded assets (drag-and-drop)
// ---------------------------------------------------------------------------

/** A file uploaded by the user via the Studio drag-and-drop zone. */
export interface UploadedAsset {
  /** Brain-assigned asset id (e.g. "upload_1234567890") */
  assetId: string;
  /** Publicly reachable URL returned by the brain (or blob: URL while pending) */
  url: string;
  /** Detected media kind */
  kind: 'image' | 'video' | 'audio';
  /** Original filename */
  filename: string;
  /** Always 'user_upload' — recorded in the brain's lineage manifest */
  provenance: 'user_upload';
}

/** Per-file upload state tracked by the drop zone UI. */
export interface UploadEntry {
  /** Local id — used as React key before the brain responds */
  localId: string;
  file: File;
  /** 0–100 */
  progress: number;
  status: 'uploading' | 'done' | 'error';
  /** Set on status === 'done' */
  asset?: UploadedAsset;
  /** Set on status === 'error' */
  error?: string;
}

// A Higgsfield job_set_type (image or video model id). Selectable options are
// curated in STUDIO_IMAGE_MODELS / STUDIO_VIDEO_MODELS below.
export type StudioModel = string;

export type StudioResolution = '1k' | '2k' | '4k';

export interface StudioResult {
  id: string;
  url: string;
  tab: StudioTab;
  prompt: string;
  createdAt: number;
}

/** A keyframe staged on the Video tab — an image ref (from the Images→Video bridge, the Library,
 *  or Scene Director on Video) that will seed video generation. Ordered in the tray. */
export interface VideoKeyframe {
  /** Source image manifest id (brain). */
  id: string;
  /** Publicly reachable still URL. */
  url: string;
  /** Optional short label (prompt fragment / name) for the tray tile. */
  label?: string;
}

/** Generated Storyboard — per-gap direction for the transition that STARTS at a keyframe (keyed by
 *  the from-keyframe id, so it follows the frame through reorder). */
export interface StoryboardGap {
  /** Free-text "how should this transition go?" */
  description?: string;
  /** Camera move for this segment (overrides the global motion). */
  movement?: string;
  speed?: string;
  /** How long this transition lingers (seconds); total video = sum of per-gap durations. */
  durationS?: number;
}

// ---------------------------------------------------------------------------
// Script (Audio Studio writer's room — Plan 1). Mirrors the brain model in
// services/brain/lib/scripts.mjs. The store, script-client, capabilities, the
// Audio Director, and the Script panel all speak these.
// ---------------------------------------------------------------------------

export type ScriptFormat = 'reel' | 'tiktok_ad' | 'short_film' | 'explainer' | 'testimonial';
export type ScriptStructure = 'pas' | 'aida' | 'bab' | 'hook_retain_reward_cta' | 'film_beats';
// 'brand' = speak in the active brand's voice/persona (resolved at render in Plan 2).
export type ScriptTone = 'brand' | 'conversational' | 'warm' | 'authoritative' | 'energetic' | 'calm';
export type HookPattern = 'contrarian' | 'proof' | 'curiosity' | 'pov' | 'callout' | 'pattern_interrupt';

export interface ScriptCharacter { id: string; name: string; role: string; default_tone: ScriptTone; }
/** tone '' = inherit the character's default_tone. */
export interface ScriptLine { id: string; character_id: string | null; text: string; tone: ScriptTone | ''; direction: string; sfx_cue: string; }
export interface ScriptBeat { id: string; label: string; target_start_s: number; target_duration_s: number; lines: ScriptLine[]; }
export interface ScriptHook { id: string; pattern: HookPattern; text: string; selected: boolean; }
export interface ScriptPron { term: string; phonetic: string; }

export interface ScriptDoc {
  script_id: string;
  brand_kit_id: string;
  name: string;
  format: ScriptFormat;
  structure: ScriptStructure | '';
  target_duration_s: number;
  words_per_second: number;
  default_tone: ScriptTone; // script-level voice/persona (defaults to 'brand')
  cast: ScriptCharacter[];
  beats: ScriptBeat[];
  hooks: ScriptHook[];
  pronunciation: ScriptPron[];
  created_at: string;
  updated_at: string;
}

/** GET /scripts/frameworks payload — drives the Director + Script-panel pickers. */
export interface ScriptFrameworks {
  structures: Array<{ id: ScriptStructure; label: string; blurb: string; beats: Array<{ label: string; share: number; note: string }>; skeleton: ScriptBeat[] }>;
  hooks: Array<{ id: HookPattern; label: string; guidance: string; example: string }>;
  templates: Array<{ id: string; label: string; format: string; fields: string[]; sample: string }>;
}

export const SCRIPT_FORMATS: ScriptFormat[] = ['reel', 'tiktok_ad', 'short_film', 'explainer', 'testimonial'];
export const SCRIPT_TONES: ScriptTone[] = ['brand', 'conversational', 'warm', 'authoritative', 'energetic', 'calm'];
/** Human label for a tone/persona option (brand reads as "Brand voice"). */
export const TONE_LABELS: Record<ScriptTone, string> = {
  brand: 'Brand voice',
  conversational: 'Conversational',
  warm: 'Warm',
  authoritative: 'Authoritative',
  energetic: 'Energetic',
  calm: 'Calm',
};

export interface StudioState {
  activeTab: StudioTab;
  prompt: string;
  model: StudioModel;
  aspectRatio: string; // e.g. "1:1", "16:9"
  resolution: StudioResolution;
  /** storyboard slots — null = empty. Fixed length keeps positions stable. */
  slots: Array<StudioResult | null>;
  status: 'idle' | 'generating' | 'error';
  error?: string;
  results: StudioResult[];
  /** User-uploaded assets (drag-and-drop → brain). Durable within the session. */
  uploadedAssets: UploadedAsset[];
  /** Avatar library — null until first loaded from the brain registry. */
  avatars: CloneRecord[] | null;
  /** Onboarding wizard state — null when the wizard is closed. */
  avatarOnboarding: AvatarOnboardingState | null;
  /** Audio tab: selected library voice id (shared by manual UI + agent). */
  audioVoiceId: string;
  /** Audio tab: voice-over script (shared by manual UI + agent). */
  audioScript: string;
  /** Audio tab: the active structured Script being authored (writer's room). The agent's
   *  script.* capabilities + the Script panel both write here (shared lever). null = none. */
  activeScript: ScriptDoc | null;
  /** Active Campaign context (Content Composer) — shared across tabs. */
  activeCampaignId: string | null;
  /** Active Ad context within the campaign — "Add to ad" + composers target this. */
  activeAdId: string | null;
  /** Composer tab: selected Brand Kit id (shared by manual UI + agent). */
  composerBrandKitId: string;
  /** Composer tab: active Template id (shared by manual UI + agent's compose.useTemplate). */
  composerTemplateId: string;
  /** Images tab: the library image the user has selected (so the AI Agent can see/act on it). */
  selectedImageId: string | null;
  /** Video tab: ordered keyframes staged for the next video generation (the Images→Video bridge +
   *  Scene Director on Video drop here; the keyframe tray + Library's Keyframes view read this). */
  videoKeyframes: VideoKeyframe[];
  /** Generated Storyboard: per-gap transition direction, keyed by the from-keyframe id (survives reorder). */
  storyboardGaps: Record<string, StoryboardGap>;
  /** Video Editor tab: the multi-track NLE edit (the serializable, agent-drivable timeline document). */
  timeline: TimelineEDL;
  /** Draggable floating agent chat window: null = closed, else open. In generation-interview
   *  mode it carries the kind + brand + target slot so Create can run that kind's generator. */
  floatingAgent: { seed?: string; kind?: string; brandKitId?: string; slot?: string } | null;
}

export interface ModelOption {
  value: string;
  label: string;
  credits: string;
}

// Image-generation models (Images tab). Higgsfield job_set_type values.
export const STUDIO_IMAGE_MODELS: ModelOption[] = [
  { value: 'nano_banana_flash', label: 'Nano Banana 2', credits: '~1 cr' },
  { value: 'nano_banana_2', label: 'Nano Banana Pro', credits: '~2-4 cr' },
  { value: 'flux_2', label: 'FLUX.2', credits: 'varies' },
  { value: 'text2image_soul_v2', label: 'Higgsfield Soul V2', credits: 'varies' },
];

// Video-generation models (Video tab). Higgsfield video job_set_type values.
// Ordered cheapest → premium; the Video Director defaults to the first (Kling 3.0 Turbo). Live per-shot
// cost is shown via the Director's cost readout (GET /video/cost); these hints are just a coarse tier.
export const STUDIO_VIDEO_MODELS: ModelOption[] = [
  { value: 'kling3_0_turbo', label: 'Kling 3.0 Turbo', credits: 'low' },
  { value: 'kling3_0', label: 'Kling v3.0', credits: 'low' },
  { value: 'veo3_1_lite', label: 'Google Veo 3.1 Lite', credits: 'low' },
  { value: 'kling2_6', label: 'Kling 2.6', credits: 'varies' },
  { value: 'minimax_hailuo', label: 'Minimax Hailuo', credits: 'varies' },
  { value: 'wan2_6', label: 'Wan 2.6', credits: 'varies' },
  { value: 'seedance_2_0', label: 'Seedance 2.0', credits: 'high' },
  { value: 'veo3_1', label: 'Google Veo 3.1', credits: 'high' },
];

// Back-compat alias (image models). Prefer modelsForKind().
export const STUDIO_MODELS = STUDIO_IMAGE_MODELS;

/** The model list for a given tab/kind — image models for images, video for video. */
export function modelsForKind(kind: string): ModelOption[] {
  return kind === 'video' ? STUDIO_VIDEO_MODELS : STUDIO_IMAGE_MODELS;
}

export const STUDIO_ASPECT_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const STUDIO_RESOLUTIONS: StudioResolution[] = ['1k', '2k', '4k'];
export const STUDIO_SLOT_COUNT = 12;
