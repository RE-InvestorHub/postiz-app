// Shared types for the Studio control surface.
// The store, the action/capability layer, and the UI all speak these.

export type StudioTab = 'images' | 'video' | 'audio' | 'editor';

// Image models exposed in v1 (subset of Higgsfield's catalog; cheapest first).
export type StudioModel =
  | 'nano_banana_flash' // Nano Banana 2 — 1 credit
  | 'nano_banana_2' // Nano Banana Pro — 2-4 credits
  | 'flux_2'
  | 'text2image_soul_v2';

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
}

export const STUDIO_MODELS: { value: StudioModel; label: string; credits: string }[] = [
  { value: 'nano_banana_flash', label: 'Nano Banana 2', credits: '~1 cr' },
  { value: 'nano_banana_2', label: 'Nano Banana Pro', credits: '~2-4 cr' },
  { value: 'flux_2', label: 'FLUX.2', credits: 'varies' },
  { value: 'text2image_soul_v2', label: 'Higgsfield Soul V2', credits: 'varies' },
];

export const STUDIO_ASPECT_RATIOS = ['1:1', '3:2', '2:3', '4:3', '3:4', '4:5', '5:4', '9:16', '16:9', '21:9'];
export const STUDIO_RESOLUTIONS: StudioResolution[] = ['1k', '2k', '4k'];
export const STUDIO_SLOT_COUNT = 12;
