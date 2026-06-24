// Shared types for the Studio control surface.
// The store, the action/capability layer, and the UI all speak these.

export type StudioTab = 'images' | 'video' | 'audio' | 'editor';

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
export const STUDIO_VIDEO_MODELS: ModelOption[] = [
  { value: 'veo3_1', label: 'Google Veo 3.1', credits: 'high' },
  { value: 'veo3', label: 'Google Veo 3', credits: 'high' },
  { value: 'seedance_2_0', label: 'Seedance 2.0', credits: 'varies' },
  { value: 'seedance1_5', label: 'Seedance 1.5 Pro', credits: 'varies' },
  { value: 'kling3_0', label: 'Kling v3.0', credits: 'varies' },
  { value: 'kling2_6', label: 'Kling 2.6', credits: 'varies' },
  { value: 'minimax_hailuo', label: 'Minimax Hailuo', credits: 'varies' },
  { value: 'wan2_6', label: 'Wan 2.6', credits: 'varies' },
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
