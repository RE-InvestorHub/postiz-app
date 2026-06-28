'use client';

// Studio state store — the single source of truth both the manual controls and
// the agent write to. Native React context + reducer (no new deps per the fork's
// CLAUDE.md). Every mutation flows through a typed action so the action/capability
// layer (studio.capabilities.ts) is the one path for both human and agent.

import {
  createContext,
  useContext,
  useReducer,
  ReactNode,
  Dispatch,
  FC,
} from 'react';
import {
  StudioState,
  StudioTab,
  StudioModel,
  StudioResolution,
  StudioResult,
  UploadedAsset,
  CloneRecord,
  AvatarOnboardingState,
  emptyConsentDraft,
  STUDIO_SLOT_COUNT,
} from '@gitroom/frontend/components/studio/studio.types';

export type StudioAction =
  | { type: 'SET_TAB'; tab: StudioTab }
  | { type: 'SET_PROMPT'; prompt: string }
  | { type: 'SET_MODEL'; model: StudioModel }
  | { type: 'SET_ASPECT_RATIO'; aspectRatio: string }
  | { type: 'SET_RESOLUTION'; resolution: StudioResolution }
  | { type: 'SET_STATUS'; status: StudioState['status']; error?: string }
  | { type: 'ADD_RESULT'; result: StudioResult }
  | { type: 'PLACE_IN_SLOT'; index: number; result: StudioResult | null }
  | { type: 'ADD_UPLOAD'; asset: UploadedAsset }
  | { type: 'SET_AVATARS'; avatars: CloneRecord[] }
  | { type: 'SET_AVATAR_ONBOARDING'; onboarding: AvatarOnboardingState | null }
  | { type: 'PATCH_AVATAR_ONBOARDING'; patch: Partial<AvatarOnboardingState> }
  | { type: 'SET_AUDIO_VOICE'; voiceId: string }
  | { type: 'SET_AUDIO_SCRIPT'; script: string }
  | { type: 'SET_ACTIVE_CAMPAIGN'; campaignId: string | null }
  | { type: 'SET_ACTIVE_AD'; adId: string | null }
  | { type: 'SET_COMPOSER_BRANDKIT'; brandKitId: string }
  | { type: 'SET_COMPOSER_TEMPLATE'; templateId: string }
  | { type: 'OPEN_FLOATING_AGENT'; seed?: string; kind?: string; brandKitId?: string; slot?: string }
  | { type: 'CLOSE_FLOATING_AGENT' }
  | { type: 'RESET' };

export const initialStudioState: StudioState = {
  // Studio opens on the Brand tab — brand is the root of the Brand → Campaign → Ad flow.
  activeTab: 'brand',
  prompt: '',
  model: 'nano_banana_flash',
  aspectRatio: '1:1',
  resolution: '1k',
  slots: Array.from({ length: STUDIO_SLOT_COUNT }, () => null),
  status: 'idle',
  error: undefined,
  results: [],
  uploadedAssets: [],
  avatars: null,
  avatarOnboarding: null,
  audioVoiceId: '',
  audioScript: '',
  activeCampaignId: null,
  activeAdId: null,
  composerBrandKitId: 'default',
  composerTemplateId: '',
  floatingAgent: null,
};

/** A fresh onboarding-wizard state (wizard opened at step 0). */
export function freshAvatarOnboarding(): AvatarOnboardingState {
  return {
    open: true,
    step: 0,
    consent: { ...emptyConsentDraft },
    likenessAssetIds: [],
    voiceAssetIds: [],
  };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case 'SET_TAB':
      return { ...state, activeTab: action.tab };
    case 'SET_PROMPT':
      return { ...state, prompt: action.prompt };
    case 'SET_MODEL':
      return { ...state, model: action.model };
    case 'SET_ASPECT_RATIO':
      return { ...state, aspectRatio: action.aspectRatio };
    case 'SET_RESOLUTION':
      return { ...state, resolution: action.resolution };
    case 'SET_STATUS':
      return { ...state, status: action.status, error: action.error };
    case 'ADD_RESULT':
      return { ...state, results: [action.result, ...state.results] };
    case 'PLACE_IN_SLOT': {
      const slots = state.slots.slice();
      slots[action.index] = action.result;
      return { ...state, slots };
    }
    case 'ADD_UPLOAD':
      // Prepend so the newest upload appears first; dedupe by assetId.
      if (state.uploadedAssets.some((a) => a.assetId === action.asset.assetId)) {
        return state;
      }
      return { ...state, uploadedAssets: [action.asset, ...state.uploadedAssets] };
    case 'SET_AVATARS':
      return { ...state, avatars: action.avatars };
    case 'SET_AVATAR_ONBOARDING':
      return { ...state, avatarOnboarding: action.onboarding };
    case 'PATCH_AVATAR_ONBOARDING':
      // No-op if the wizard is closed; otherwise shallow-merge the patch.
      return state.avatarOnboarding
        ? { ...state, avatarOnboarding: { ...state.avatarOnboarding, ...action.patch } }
        : state;
    case 'SET_AUDIO_VOICE':
      return { ...state, audioVoiceId: action.voiceId };
    case 'SET_ACTIVE_CAMPAIGN':
      // Switching campaigns clears the active ad (it belongs to the old campaign).
      return { ...state, activeCampaignId: action.campaignId, activeAdId: null };
    case 'SET_ACTIVE_AD':
      return { ...state, activeAdId: action.adId };
    case 'SET_COMPOSER_BRANDKIT':
      return { ...state, composerBrandKitId: action.brandKitId };
    case 'SET_COMPOSER_TEMPLATE':
      return { ...state, composerTemplateId: action.templateId };
    case 'OPEN_FLOATING_AGENT':
      return { ...state, floatingAgent: { seed: action.seed, kind: action.kind, brandKitId: action.brandKitId, slot: action.slot } };
    case 'CLOSE_FLOATING_AGENT':
      return { ...state, floatingAgent: null };
    case 'SET_AUDIO_SCRIPT':
      return { ...state, audioScript: action.script };
    case 'RESET':
      return { ...initialStudioState };
    default:
      return state;
  }
}

interface StudioContextValue {
  state: StudioState;
  dispatch: Dispatch<StudioAction>;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export const StudioProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  return (
    <StudioContext.Provider value={{ state, dispatch }}>
      {children}
    </StudioContext.Provider>
  );
};

export const useStudio = (): StudioContextValue => {
  const ctx = useContext(StudioContext);
  if (!ctx) {
    throw new Error('useStudio must be used within a StudioProvider');
  }
  return ctx;
};
