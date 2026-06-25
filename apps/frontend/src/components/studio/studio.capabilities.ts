// Studio capability registry — the "levers".
//
// Every control the human can operate is expressed here as a namespaced
// capability (`studio.*`). The manual UI dispatches these; the agent (pop-out
// panel) will call the SAME ids. This is the extension point: future domains
// (`schedule.*`, `channels.*`, `analytics.*`) register alongside these without
// touching the panel or the brain — see the plan task
// `agent-control-surface-and-registry`.

import { Dispatch } from 'react';
import {
  StudioAction,
  freshAvatarOnboarding,
} from '@gitroom/frontend/components/studio/studio.store';
import {
  StudioState,
  StudioResult,
  StudioTab,
  ConsentType,
  AvatarConsentDraft,
} from '@gitroom/frontend/components/studio/studio.types';
import {
  submitStoryboard,
} from '@gitroom/frontend/components/studio/studio.storyboard-client';
import {
  generateVO,
} from '@gitroom/frontend/components/studio/studio.voice-client';
import {
  createCampaign,
  createAd,
  addObject,
} from '@gitroom/frontend/components/studio/studio.project-client';

export interface Capability {
  /** namespaced id, e.g. "studio.setPrompt" */
  id: string;
  namespace: string;
  label: string;
  /** param names this capability accepts (for agent discovery) */
  params: string[];
  /** apply the capability; returns a promise for async ones (generate) */
  handler: (payload?: any) => void | Promise<void>;
}

export interface StudioCapabilityDeps {
  dispatch: Dispatch<StudioAction>;
  getState: () => StudioState;
  /** generation transport — calls the workspace brain/generation service */
  generate: (args: {
    tab: StudioTab;
    prompt: string;
    model: string;
    aspectRatio: string;
    resolution: string;
  }) => Promise<StudioResult>;
  /**
   * Storyboard assembly transport — submits the brief + current slots to the
   * workspace brain for video assembly. Defaults to the built-in
   * `submitStoryboard` from studio.storyboard-client; injectable for tests.
   */
  storyboard?: typeof submitStoryboard;
}

/**
 * Build the live `studio.*` capability map bound to a store dispatch + a
 * generation transport. Returned as an id→Capability record so the manual UI
 * and the agent resolve actions identically.
 */
export function buildStudioCapabilities(
  deps: StudioCapabilityDeps
): Record<string, Capability> {
  const { dispatch, getState, generate, storyboard = submitStoryboard } = deps;
  const ns = 'studio';

  const caps: Capability[] = [
    {
      id: 'studio.setTab',
      namespace: ns,
      label: 'Switch Studio tab',
      params: ['tab'],
      handler: (p) => dispatch({ type: 'SET_TAB', tab: p.tab }),
    },
    {
      id: 'studio.setPrompt',
      namespace: ns,
      label: 'Set the generation prompt',
      params: ['prompt'],
      handler: (p) => dispatch({ type: 'SET_PROMPT', prompt: p.prompt }),
    },
    {
      id: 'studio.selectModel',
      namespace: ns,
      label: 'Select the generation model',
      params: ['model'],
      handler: (p) => dispatch({ type: 'SET_MODEL', model: p.model }),
    },
    {
      id: 'studio.setAspectRatio',
      namespace: ns,
      label: 'Set the aspect ratio',
      params: ['aspectRatio'],
      handler: (p) => dispatch({ type: 'SET_ASPECT_RATIO', aspectRatio: p.aspectRatio }),
    },
    {
      id: 'studio.setResolution',
      namespace: ns,
      label: 'Set the resolution',
      params: ['resolution'],
      handler: (p) => dispatch({ type: 'SET_RESOLUTION', resolution: p.resolution }),
    },
    {
      id: 'studio.placeInSlot',
      namespace: ns,
      label: 'Place a result into a storyboard slot',
      params: ['index', 'result'],
      handler: (p) =>
        dispatch({ type: 'PLACE_IN_SLOT', index: p.index, result: p.result ?? null }),
    },
    {
      id: 'studio.generate',
      namespace: ns,
      label: 'Generate an asset from the current settings',
      params: [],
      handler: async () => {
        const s = getState();
        if (!s.prompt.trim()) {
          dispatch({ type: 'SET_STATUS', status: 'error', error: 'Prompt is empty.' });
          return;
        }
        dispatch({ type: 'SET_STATUS', status: 'generating' });
        try {
          const result = await generate({
            tab: s.activeTab,
            prompt: s.prompt,
            model: s.model,
            aspectRatio: s.aspectRatio,
            resolution: s.resolution,
          });
          dispatch({ type: 'ADD_RESULT', result });
          dispatch({ type: 'SET_STATUS', status: 'idle' });
        } catch (e: any) {
          dispatch({
            type: 'SET_STATUS',
            status: 'error',
            error: e?.message || 'Generation failed.',
          });
        }
      },
    },
    // --- Avatars: let the agent prefill/navigate the onboarding wizard. ---
    // These only manipulate UI state (open/navigate/prefill); the consequential
    // acts (recording consent, creating the clone) stay HUMAN-clicked in the
    // wizard, so the consent hard-gate is never driven by the agent alone.
    {
      id: 'studio.avatarOpen',
      namespace: ns,
      label: 'Open the avatar onboarding wizard',
      params: [],
      handler: () => {
        dispatch({ type: 'SET_TAB', tab: 'avatars' });
        const s = getState();
        if (!s.avatarOnboarding?.open) {
          dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: freshAvatarOnboarding() });
        }
      },
    },
    {
      id: 'studio.avatarSetConsent',
      namespace: ns,
      label: 'Prefill avatar consent fields',
      params: ['person', 'consentType', 'channels', 'expires', 'consentRef'],
      handler: (p: {
        person?: string;
        consentType?: ConsentType;
        channels?: string[];
        expires?: string;
        consentRef?: string;
      } = {}) => {
        dispatch({ type: 'SET_TAB', tab: 'avatars' });
        const current = getState().avatarOnboarding ?? freshAvatarOnboarding();
        const consent: AvatarConsentDraft = {
          ...current.consent,
          ...(p.person !== undefined ? { person: p.person } : {}),
          ...(p.consentType !== undefined ? { consent_type: p.consentType } : {}),
          ...(p.channels !== undefined ? { consent_channels: p.channels } : {}),
          ...(p.expires !== undefined ? { consent_expires: p.expires } : {}),
          ...(p.consentRef !== undefined ? { consent_ref: p.consentRef } : {}),
        };
        // SET the whole onboarding object so it works whether or not it was open.
        dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: { ...current, open: true, consent } });
      },
    },
    {
      id: 'studio.avatarGotoStep',
      namespace: ns,
      label: 'Navigate the avatar onboarding wizard to a step (0-3)',
      params: ['step'],
      handler: (p: { step?: number } = {}) => {
        const step = Math.max(0, Math.min(3, Number(p.step ?? 0)));
        dispatch({ type: 'PATCH_AVATAR_ONBOARDING', patch: { step } });
      },
    },
    // --- Voice-over: pick a library voice + generate VO (Audio tab). ---
    {
      id: 'studio.selectVoice',
      namespace: ns,
      label: 'Select a voice from the library (Audio tab)',
      params: ['voiceId'],
      handler: (p: { voiceId?: string } = {}) => {
        dispatch({ type: 'SET_TAB', tab: 'audio' });
        if (p.voiceId) dispatch({ type: 'SET_AUDIO_VOICE', voiceId: p.voiceId });
      },
    },
    {
      id: 'studio.generateVO',
      namespace: ns,
      label: 'Generate a voice-over with the selected voice + script',
      params: ['text', 'voiceId'],
      handler: async (p: { text?: string; voiceId?: string } = {}) => {
        dispatch({ type: 'SET_TAB', tab: 'audio' });
        const s = getState();
        const voiceId = p.voiceId ?? s.audioVoiceId;
        const text = p.text ?? s.audioScript;
        if (p.voiceId) dispatch({ type: 'SET_AUDIO_VOICE', voiceId: p.voiceId });
        if (p.text) dispatch({ type: 'SET_AUDIO_SCRIPT', script: p.text });
        if (!voiceId || !text?.trim()) {
          dispatch({ type: 'SET_STATUS', status: 'error', error: 'Pick a voice and provide a script first.' });
          return;
        }
        dispatch({ type: 'SET_STATUS', status: 'generating' });
        try {
          const vo = await generateVO({ text, voiceId });
          dispatch({
            type: 'ADD_RESULT',
            result: { id: vo.id, url: vo.url, tab: 'audio', prompt: text.slice(0, 80), createdAt: Date.now() },
          });
          dispatch({ type: 'SET_STATUS', status: 'idle' });
        } catch (e: any) {
          dispatch({ type: 'SET_STATUS', status: 'error', error: e?.message || 'VO generation failed.' });
        }
      },
    },
    {
      id: 'studio.assembleVideo',
      namespace: ns,
      label: 'Assemble a video from the current storyboard slots and brief',
      // brief is optional — the agent may supply it; otherwise falls back to
      // state-derived context. slots always come from current state.
      params: ['brief'],
      handler: async (p?: { brief?: Record<string, unknown> }) => {
        const s = getState();
        dispatch({ type: 'SET_STATUS', status: 'generating' });
        try {
          const result = await storyboard({
            brief: p?.brief ?? {},
            slots: s.slots,
          });
          dispatch({ type: 'SET_STATUS', status: 'idle' });
          if (!result.ok) {
            dispatch({
              type: 'SET_STATUS',
              status: 'error',
              error: result.message,
            });
          }
        } catch (e: any) {
          dispatch({
            type: 'SET_STATUS',
            status: 'error',
            error: e?.message || 'Storyboard assembly failed.',
          });
        }
      },
    },

    // --- Project (Content Composer): campaigns, ads, add assets. ---
    {
      id: 'project.createCampaign',
      namespace: 'project',
      label: 'Create a campaign and make it active',
      params: ['name'],
      handler: async (p: { name?: string } = {}) => {
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Campaign name required.' }); return; }
        const c = await createCampaign({ name: p.name.trim() });
        dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: c.campaign_id });
      },
    },
    {
      id: 'project.createAd',
      namespace: 'project',
      label: 'Create an ad in the active campaign and make it active',
      params: ['name'],
      handler: async (p: { name?: string } = {}) => {
        const campaignId = getState().activeCampaignId;
        if (!campaignId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select or create a campaign first.' }); return; }
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Ad name required.' }); return; }
        const a = await createAd({ campaignId, name: p.name.trim() });
        dispatch({ type: 'SET_ACTIVE_AD', adId: a.ad_id });
      },
    },
    {
      id: 'project.selectCampaign',
      namespace: 'project',
      label: 'Set the active campaign',
      params: ['campaignId'],
      handler: (p: { campaignId?: string } = {}) => dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: p.campaignId ?? null }),
    },
    {
      id: 'project.selectAd',
      namespace: 'project',
      label: 'Set the active ad',
      params: ['adId'],
      handler: (p: { adId?: string } = {}) => dispatch({ type: 'SET_ACTIVE_AD', adId: p.adId ?? null }),
    },
    {
      id: 'project.addObject',
      namespace: 'project',
      label: 'Add an asset (by type + id) to the active ad',
      params: ['type', 'id'],
      handler: async (p: { type?: string; id?: string } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        if (!p.type || !p.id) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'type and id required.' }); return; }
        await addObject({ adId, type: p.type as any, id: p.id });
      },
    },
  ];

  return caps.reduce<Record<string, Capability>>((acc, c) => {
    acc[c.id] = c;
    return acc;
  }, {});
}

/** Discovery list for the agent — which capabilities exist + their params. */
export function listCapabilities(
  caps: Record<string, Capability>
): Array<{ id: string; label: string; params: string[] }> {
  return Object.values(caps).map(({ id, label, params }) => ({ id, label, params }));
}
