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
  getAdObjects,
  updateAd,
  updateCampaign,
  deleteCampaign,
  deleteAd,
} from '@gitroom/frontend/components/studio/studio.project-client';
import { createFromPreset as createDataRecordPreset, setRecordField, removeRecordField } from '@gitroom/frontend/components/studio/studio.datarecord-client';
import { composeStill, createTemplateFromStill, composeVideoAd, composeCarousel, composeEmail, createBrandKit, updateBrandKit } from '@gitroom/frontend/components/studio/studio.composer-client';
import { listBrands, createBrand, updateBrand, addBrandFile, deleteBrand, extractBrand, completeBrandPalette, suggestBrandFonts, draftBrandVoice, generateBrandLogos, getBrand, downloadBrandKit, deriveLogoSlot, LogoSlot } from '@gitroom/frontend/components/studio/studio.brand-client';
import { planVideo, startRun, acceptShot as pipelineAcceptShot, regenShot as pipelineRegenShot, assembleRun, estimateVideo } from '@gitroom/frontend/components/studio/studio.pipeline-client';
import { reshapeImage } from '@gitroom/frontend/components/studio/studio.image-client';
import { startSoulTraining, removeSoul, renderDirectorClip, gapFillVideo, renderDirectorShot, getVideoCost } from '@gitroom/frontend/components/studio/studio.director-client';
import { addKeyframes, removeKeyframe } from '@gitroom/frontend/components/studio/studio.video-client';
import * as scriptClient from '@gitroom/frontend/components/studio/studio.script-client';
import * as voiceClient from '@gitroom/frontend/components/studio/studio.voice-client';
import { enqueueRender } from '@gitroom/frontend/components/studio/studio.remotion-client';
import type { TimelineEDL, Clip } from '@gitroom/frontend/components/studio/timeline/timeline.contract';

/** Fire the library-refresh event so the Images canvas re-fetches (picks up a new variant). */
function refreshImageLibrary(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh'));
}

/** Fire the Video-library refresh event so the Video tab re-fetches its clips + keyframes. */
function refreshVideoLibrary(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh'));
}

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
    brandKitId?: string;
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
            brandKitId: s.composerBrandKitId,
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
    {
      id: 'project.deleteCampaign',
      namespace: 'project',
      label: 'Delete a campaign (cascades: its ads are deleted too; assets survive)',
      params: ['campaignId'],
      handler: async (p: { campaignId?: string } = {}) => {
        const id = p.campaignId ?? getState().activeCampaignId;
        if (!id) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No campaign to delete.' }); return; }
        await deleteCampaign(id);
        // If we deleted the active campaign, clear it (this also clears the active ad).
        if (getState().activeCampaignId === id) dispatch({ type: 'SET_ACTIVE_CAMPAIGN', campaignId: null });
      },
    },
    {
      id: 'project.deleteAd',
      namespace: 'project',
      label: 'Delete an ad (de-links from its campaign; the campaign + assets survive)',
      params: ['adId'],
      handler: async (p: { adId?: string } = {}) => {
        const id = p.adId ?? getState().activeAdId;
        if (!id) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No ad to delete.' }); return; }
        await deleteAd(id);
        // If we deleted the active ad, clear just the ad (keep the campaign active).
        if (getState().activeAdId === id) dispatch({ type: 'SET_ACTIVE_AD', adId: null });
      },
    },
    {
      id: 'project.renameCampaign',
      namespace: 'project',
      label: 'Rename a campaign',
      params: ['name', 'campaignId'],
      handler: async (p: { name?: string; campaignId?: string } = {}) => {
        const id = p.campaignId ?? getState().activeCampaignId;
        if (!id) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No campaign to rename.' }); return; }
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'New name required.' }); return; }
        await updateCampaign(id, { name: p.name.trim() });
      },
    },
    {
      id: 'project.renameAd',
      namespace: 'project',
      label: 'Rename an ad',
      params: ['name', 'adId'],
      handler: async (p: { name?: string; adId?: string } = {}) => {
        const id = p.adId ?? getState().activeAdId;
        if (!id) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No ad to rename.' }); return; }
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'New name required.' }); return; }
        await updateAd(id, { name: p.name.trim() });
      },
    },

    // --- Brand (the elevated Brand entity: persona + palette + typography + 5 logos) ---
    {
      id: 'brand.list',
      namespace: 'brand',
      label: 'List brands (with status/tier); pass liveOnly for Composer-usable only',
      params: ['liveOnly'],
      handler: (p: { liveOnly?: boolean } = {}) => listBrands({ liveOnly: p.liveOnly }),
    },
    {
      id: 'brand.create',
      namespace: 'brand',
      label: 'Create a Brand (starts as a draft — needs all 5 logos to go live) and make it active',
      params: ['name'],
      handler: async (p: { name?: string } = {}) => {
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Brand name required.' }); return; }
        const b = await createBrand({ name: p.name.trim() });
        dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: b.brand_kit_id });
        return b;
      },
    },
    {
      id: 'brand.select',
      namespace: 'brand',
      label: 'Set the active Brand by id',
      params: ['brandKitId'],
      handler: (p: { brandKitId?: string } = {}) =>
        dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: p.brandKitId || 'default' }),
    },
    {
      id: 'brand.update',
      namespace: 'brand',
      label: 'Update the active (or given) Brand: name / persona / palette / typography',
      params: ['brandKitId', 'name', 'persona', 'palette', 'typography'],
      handler: async (p: any = {}) => {
        const id = p.brandKitId ?? getState().composerBrandKitId;
        if (!id || id === 'default') { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select a custom brand first (the default is read-only).' }); return; }
        return updateBrand(id, {
          ...(p.name ? { name: String(p.name).trim() } : {}),
          ...(p.persona ? { persona: p.persona } : {}),
          ...(p.palette ? { palette: p.palette } : {}),
          ...(p.typography ? { typography: p.typography } : {}),
        });
      },
    },
    {
      id: 'brand.addLogo',
      namespace: 'brand',
      label: 'Attach an uploaded asset to a Brand logo slot (mark/wordmark/lockupColor/lockupDark/lockupLight)',
      params: ['brandKitId', 'slot', 'assetId'],
      handler: async (p: { brandKitId?: string; slot?: any; assetId?: string } = {}) => {
        const id = p.brandKitId ?? getState().composerBrandKitId;
        if (!id || id === 'default') { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select a custom brand first.' }); return; }
        if (!p.slot || !p.assetId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'slot and assetId required.' }); return; }
        return addBrandFile(id, { slot: p.slot, assetId: p.assetId });
      },
    },
    {
      id: 'brand.delete',
      namespace: 'brand',
      label: 'Delete a custom Brand (its campaigns move to Default)',
      params: ['brandKitId'],
      handler: async (p: { brandKitId?: string } = {}) => {
        const id = p.brandKitId ?? getState().composerBrandKitId;
        if (!id || id === 'default') { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No custom brand to delete.' }); return; }
        await deleteBrand(id);
        if (getState().composerBrandKitId === id) dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: 'default' });
      },
    },
    {
      id: 'brand.extract',
      namespace: 'brand',
      label: 'Normalize pasted brand info into { palette, typography, persona } (apply with brand.update)',
      params: ['text'],
      handler: async (p: { text?: string } = {}) => {
        if (!p.text?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Brand text required.' }); return; }
        return extractBrand(p.text);
      },
    },
    {
      id: 'brand.completePalette',
      namespace: 'brand',
      label: 'AI-complete the active brand\'s palette to 8 (no spend)',
      params: ['brandKitId'],
      handler: (p: { brandKitId?: string } = {}) => { const id = p.brandKitId ?? getState().composerBrandKitId; return id && id !== 'default' ? completeBrandPalette(id) : undefined; },
    },
    {
      id: 'brand.suggestFonts',
      namespace: 'brand',
      label: 'Suggest a font pairing for the active brand (no spend)',
      params: ['brandKitId'],
      handler: (p: { brandKitId?: string } = {}) => { const id = p.brandKitId ?? getState().composerBrandKitId; return id && id !== 'default' ? suggestBrandFonts(id) : undefined; },
    },
    {
      id: 'brand.draftVoice',
      namespace: 'brand',
      label: 'Draft a brand voice for the active brand (cheap text)',
      params: ['brandKitId'],
      handler: (p: { brandKitId?: string } = {}) => { const id = p.brandKitId ?? getState().composerBrandKitId; return id && id !== 'default' ? draftBrandVoice(id) : undefined; },
    },
    {
      id: 'brand.generateLogos',
      namespace: 'brand',
      label: 'GENERATE a logo for the active brand + bootstrap its 5 slots (SPENDS image credits)',
      params: ['brandKitId'],
      handler: (p: { brandKitId?: string } = {}) => { const id = p.brandKitId ?? getState().composerBrandKitId; return id && id !== 'default' ? generateBrandLogos(id) : undefined; },
    },
    {
      id: 'brand.deriveSlot',
      namespace: 'brand',
      label: 'Derive a logo slot from the brand\'s existing logos (free, no spend)',
      params: ['brandKitId', 'slot'],
      handler: async (p: { brandKitId?: string; slot?: string } = {}) => {
        const id = p.brandKitId ?? getState().composerBrandKitId ?? 'default';
        if (!p.slot) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Pick a logo slot to derive.' }); return; }
        return deriveLogoSlot(id, p.slot as LogoSlot);
      },
    },
    {
      id: 'brand.exportKit',
      namespace: 'brand',
      label: 'Download a COMPLETE brand as a .zip for agency hand-off (no spend)',
      params: ['brandKitId'],
      // Unlike the authoring helpers, the Default brand IS exportable (it is complete).
      handler: async (p: { brandKitId?: string } = {}) => {
        const id = p.brandKitId ?? getState().composerBrandKitId ?? 'default';
        const brand = await getBrand(id);
        if (brand?.tier !== 'complete') {
          dispatch({ type: 'SET_STATUS', status: 'error', error: 'Brand kit is not complete yet — finish the logos, colors, fonts and voice first.' });
          return { ok: false, tier: brand?.tier, missing: brand?.missing };
        }
        downloadBrandKit(id);
        return { ok: true, downloaded: brand.name };
      },
    },

    // --- Composer (Content Composer): Still deliverable. ---
    {
      id: 'compose.selectBrandKit',
      namespace: 'compose',
      label: 'Set the Brand Kit the Composer renders with',
      params: ['brandKitId'],
      handler: (p: { brandKitId?: string } = {}) =>
        dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: p.brandKitId || 'default' }),
    },
    {
      id: 'compose.composeStill',
      namespace: 'compose',
      label: 'Compose a branded Still post (per channel) from an Ad image — spends a render',
      params: ['imageRef', 'headline', 'sub', 'cta', 'channels'],
      handler: async (p: {
        imageRef?: string; headline?: string; sub?: string; cta?: string;
        data?: Array<{ label: string; value: string }>; channels?: string[]; brandKitId?: string; layout?: any;
      } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        // Default the source to the Ad's first image when the agent doesn't name one.
        let imageRef = p.imageRef;
        if (!imageRef) {
          const objs = await getAdObjects(adId);
          imageRef = objs.find((o) => o.type === 'image')?.id;
        }
        if (!imageRef) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No image on this ad to compose from.' }); return; }
        await composeStill({
          imageRef,
          adId,
          addToAd: true,
          brandKitId: p.brandKitId || getState().composerBrandKitId || 'default',
          channels: p.channels && p.channels.length ? p.channels : ['ig_square'],
          ...(p.layout ? { layout: p.layout } : {}),
          copy: { headline: p.headline, sub: p.sub, cta: p.cta, data: p.data },
        });
      },
    },

    {
      id: 'compose.composeCarousel',
      namespace: 'compose',
      label: 'Compose a branded multi-slide carousel from Ad images (one render per slide) — spends a render',
      params: ['slides', 'channel', 'brandKitId'],
      handler: async (p: {
        slides?: Array<{ imageRef?: string; headline?: string; sub?: string; cta?: string; data?: Array<{ label: string; value: string }> }>;
        channel?: string; brandKitId?: string;
      } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        // Build slides: explicit list wins; otherwise every image on the Ad, in order.
        type Slide = { imageRef: string; copy: { headline?: string; sub?: string; cta?: string; data?: Array<{ label: string; value: string }> } };
        let slides: Slide[] = (p.slides || [])
          .filter((s) => s.imageRef)
          .map((s) => ({ imageRef: s.imageRef as string, copy: { headline: s.headline, sub: s.sub, cta: s.cta, data: s.data } }));
        if (!slides.length) {
          const objs = await getAdObjects(adId);
          slides = objs.filter((o) => o.type === 'image').map((o) => ({ imageRef: o.id, copy: {} }));
        }
        if (!slides.length) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No images on this ad to build a carousel from.' }); return; }
        await composeCarousel({
          adId, addToAd: true,
          brandKitId: p.brandKitId || getState().composerBrandKitId || 'default',
          channel: p.channel || 'ig_square',
          slides,
        });
      },
    },
    {
      id: 'compose.composeEmail',
      namespace: 'compose',
      label: 'Compose a branded responsive HTML email from an Ad hero image + copy — spends a render',
      params: ['heroRef', 'headline', 'sub', 'body', 'cta', 'ctaUrl', 'brandKitId'],
      handler: async (p: {
        heroRef?: string; headline?: string; sub?: string; body?: string; cta?: string; ctaUrl?: string; brandKitId?: string;
      } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        if (!p.headline?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Email headline required.' }); return; }
        // Default the hero to the Ad's first image when the agent doesn't name one.
        let heroRef = p.heroRef;
        if (!heroRef) {
          const objs = await getAdObjects(adId);
          heroRef = objs.find((o) => o.type === 'image')?.id;
        }
        await composeEmail({
          adId, heroRef,
          brandKitId: p.brandKitId || getState().composerBrandKitId || 'default',
          copy: { headline: p.headline.trim(), sub: p.sub, body: p.body, cta: p.cta, ctaUrl: p.ctaUrl },
        });
      },
    },

    // --- Brand Kit authoring. Curation, no spend → auto-approved. ---
    {
      id: 'compose.createBrandKit',
      namespace: 'compose',
      label: 'Create a custom Brand Kit (role colors + fonts) and make it active',
      params: ['name', 'roles'],
      handler: async (p: { name?: string; roles?: any } = {}) => {
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Brand Kit name required.' }); return; }
        const kit = await createBrandKit({ name: p.name.trim(), roles: p.roles });
        dispatch({ type: 'SET_COMPOSER_BRANDKIT', brandKitId: kit.brand_kit_id });
      },
    },
    {
      id: 'compose.updateBrandKit',
      namespace: 'compose',
      label: 'Update an existing custom Brand Kit (name and/or role colors + fonts)',
      params: ['brandKitId', 'name', 'roles'],
      handler: async (p: { brandKitId?: string; name?: string; roles?: any } = {}) => {
        const id = p.brandKitId || getState().composerBrandKitId;
        if (!id || id === 'default') { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Pick a custom Brand Kit to update (the built-in "default" is read-only).' }); return; }
        await updateBrandKit({ id, patch: { ...(p.name ? { name: p.name.trim() } : {}), ...(p.roles ? { roles: p.roles } : {}) } });
      },
    },

    // --- Video cost/plan PREVIEW (read-only, no spend → auto-approved). ---
    {
      id: 'compose.estimateVideo',
      namespace: 'compose',
      label: 'Estimate the credit cost of a video run before spending (read-only)',
      params: ['model', 'shots', 'durationS'],
      handler: async (p: { model?: string; shots?: number; durationS?: number } = {}) => {
        const est = await estimateVideo({ model: p.model, shots: p.shots, durationS: p.durationS });
        dispatch({ type: 'SET_STATUS', status: 'idle', error: `estimate: ${est.total} credits (${est.shots} shots × ${est.perShotCredits} on ${est.model})` });
      },
    },
    {
      id: 'compose.planVideo',
      namespace: 'compose',
      label: 'Plan a short from the active Ad (brief → storyboard) WITHOUT generating — preview only',
      params: ['core_message', 'cta', 'visual_style', 'aspect_ratio'],
      handler: async (p: { core_message?: string; cta?: string; visual_style?: string; aspect_ratio?: string } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        if (!p.core_message?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'core_message required.' }); return; }
        const plan = await planVideo({ adId, core_message: p.core_message.trim(), cta: p.cta, visual_style: p.visual_style, aspect_ratio: p.aspect_ratio });
        const shots = plan?.storyboard?.shots?.length ?? plan?.storyboard?.scenes?.length ?? 0;
        dispatch({ type: 'SET_STATUS', status: 'idle', error: `planned ${shots} shots (preview — nothing generated yet)` });
      },
    },

    // --- Templates (reusable Composer structure). Curation, no spend → auto-approved. ---
    {
      id: 'template.useTemplate',
      namespace: 'template',
      label: 'Make a Composer template active (pre-fills copy + channels)',
      params: ['templateId'],
      handler: (p: { templateId?: string } = {}) =>
        dispatch({ type: 'SET_COMPOSER_TEMPLATE', templateId: p.templateId || '' }),
    },
    {
      id: 'template.saveAsTemplate',
      namespace: 'template',
      label: 'Save the current Still structure as a reusable template',
      params: ['name', 'headline', 'sub', 'cta', 'channels'],
      handler: async (p: {
        name?: string; headline?: string; sub?: string; cta?: string;
        data?: Array<{ label: string; value: string }>; channels?: string[];
      } = {}) => {
        if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Template name required.' }); return; }
        const t = await createTemplateFromStill({
          name: p.name.trim(),
          copy: { headline: p.headline, sub: p.sub, cta: p.cta, data: p.data },
          channels: p.channels && p.channels.length ? p.channels : ['ig_square'],
        });
        dispatch({ type: 'SET_COMPOSER_TEMPLATE', templateId: t.template_id });
      },
    },

    // --- Video composer (pipeline). startVideoRun/regenShot/assemble SPEND → gated;
    //     acceptShot is curation → auto. Async by runId (returned to the agent). ---
    {
      id: 'compose.startVideoRun',
      namespace: 'compose',
      label: 'Plan a short from the active Ad and start the video pipeline (spends credits)',
      params: ['core_message', 'cta', 'visual_style', 'aspect_ratio', 'voiceTone', 'music'],
      handler: async (p: { core_message?: string; cta?: string; visual_style?: string; aspect_ratio?: string; voiceTone?: string; music?: { mood?: string; bedId?: string; volume?: number } } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        if (!p.core_message?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'core_message required.' }); return; }
        const plan = await planVideo({ adId, core_message: p.core_message.trim(), cta: p.cta, visual_style: p.visual_style, aspect_ratio: p.aspect_ratio });
        const started = await startRun({
          storyboard: plan.storyboard,
          ...(p.voiceTone ? { voiceTone: p.voiceTone } : {}),
          ...(p.music && (p.music.mood || p.music.bedId) ? { music: p.music } : {}),
        });
        dispatch({ type: 'SET_STATUS', status: 'idle', error: `video run started: ${started.runId}` });
      },
    },
    {
      id: 'compose.acceptShot',
      namespace: 'compose',
      label: 'Accept a generated shot in a video run',
      params: ['runId', 'shotId'],
      handler: async (p: { runId?: string; shotId?: string } = {}) => {
        if (!p.runId || !p.shotId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'runId and shotId required.' }); return; }
        await pipelineAcceptShot({ runId: p.runId, shotId: p.shotId });
      },
    },
    {
      id: 'compose.regenShot',
      namespace: 'compose',
      label: 'Reject a shot with feedback and regenerate it (spends credits)',
      params: ['runId', 'shotId', 'feedback'],
      handler: async (p: { runId?: string; shotId?: string; feedback?: string } = {}) => {
        if (!p.runId || !p.shotId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'runId and shotId required.' }); return; }
        await pipelineRegenShot({ runId: p.runId, shotId: p.shotId, feedback: p.feedback });
      },
    },
    {
      id: 'compose.assembleVideo',
      namespace: 'compose',
      label: 'Assemble the short once all shots are accepted (spends a render)',
      params: ['runId'],
      handler: async (p: { runId?: string } = {}) => {
        if (!p.runId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'runId required.' }); return; }
        await assembleRun({ runId: p.runId });
      },
    },
    {
      id: 'compose.cutVideoAd',
      namespace: 'compose',
      label: 'Cut an Ad clip into channel × length video-ad variants (ffmpeg render)',
      params: ['clipRef', 'channels', 'lengths', 'strategy', 'headline', 'cta', 'music'],
      handler: async (p: { clipRef?: string; channels?: string[]; lengths?: number[]; strategy?: 'smart' | 'head'; headline?: string; cta?: string; data?: Array<{ label: string; value: string }>; music?: { mood?: string; bedId?: string; volume?: number } } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        if (!p.clipRef) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'clipRef required.' }); return; }
        await composeVideoAd({
          adId, clipRef: p.clipRef, addToAd: true,
          brandKitId: getState().composerBrandKitId || 'default',
          channels: p.channels && p.channels.length ? p.channels : ['story'],
          lengths: p.lengths && p.lengths.length ? p.lengths : [6, 15],
          copy: { headline: p.headline, cta: p.cta, data: p.data },
          ...(p.strategy === 'head' ? { strategy: 'head' as const } : {}),   // smart is the brain default
          ...(p.music && (p.music.mood || p.music.bedId) ? { music: p.music } : {}),
        });
      },
    },

    // --- Data records (data-bound supers). Curation, no spend → auto-approved. ---
    {
      id: 'data.createRecord',
      namespace: 'data',
      label: 'Create a data record from a preset (product/service/event/offer/real_estate/blank) and link it to the ad',
      params: ['name', 'kind'],
      handler: async (p: { name?: string; kind?: string } = {}) => {
        const adId = getState().activeAdId;
        const r = await createDataRecordPreset({ name: p.name?.trim() || `New ${p.kind || 'record'}`, kind: p.kind || 'blank' });
        if (adId) { try { await updateAd(adId, { data_record_id: r.record_id }); } catch { /* */ } }
      },
    },
    {
      id: 'data.setField',
      namespace: 'data',
      label: 'Set a field (label + value) on a data record',
      params: ['recordId', 'label', 'value'],
      handler: async (p: { recordId?: string; key?: string; label?: string; value?: string } = {}) => {
        if (!p.recordId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'recordId required.' }); return; }
        await setRecordField({ id: p.recordId, field: { key: p.key, label: p.label, value: p.value } });
      },
    },
    {
      id: 'data.removeField',
      namespace: 'data',
      label: 'Remove a field (by key) from a data record',
      params: ['recordId', 'key'],
      handler: async (p: { recordId?: string; key?: string } = {}) => {
        if (!p.recordId || !p.key) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'recordId and key required.' }); return; }
        await removeRecordField({ id: p.recordId, key: p.key });
      },
    },
    {
      id: 'data.selectRecord',
      namespace: 'data',
      label: 'Set the active data record on the ad',
      params: ['recordId'],
      handler: async (p: { recordId?: string } = {}) => {
        const adId = getState().activeAdId;
        if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Select an ad first.' }); return; }
        await updateAd(adId, { data_record_id: p.recordId || null });
      },
    },
    {
      id: 'image.reshape',
      namespace: 'image',
      label: 'Reshape a library image to a channel size (free — new variant)',
      params: ['id', 'channel', 'fit'],
      handler: async (p: { id?: string; channel?: string; fit?: 'crop' | 'pad' } = {}) => {
        if (!p.id || !p.channel) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Need an image id + channel to reshape.' }); return; }
        return reshapeImage(p.id, p.channel, p.fit === 'pad' ? 'pad' : 'crop');
      },
    },
    {
      // Graphics-engineer typed edit. The brain ALREADY ran the op in its agent loop (so it could
      // see the result and iterate) and the new variant is recorded; this capability just refreshes
      // the library so the new variant appears on the canvas. Free → auto-approved. (The direct
      // lever is editImage() in studio.image-client — used by manual UI, not re-run here.)
      id: 'image.edit',
      namespace: 'image',
      label: 'Apply a graphics edit to a library image (free — new variant)',
      params: ['op', 'params', 'sourceId'],
      handler: async () => { refreshImageLibrary(); },
    },
    {
      // Guarded general ImageMagick edit — same execution model as image.edit (brain-run, here we
      // only refresh). Free → auto-approved; the sandbox (allowlist + policy) is enforced in the brain.
      id: 'image.magick',
      namespace: 'image',
      label: 'Apply a guarded ImageMagick chain to a library image (free — new variant)',
      params: ['ops', 'sourceId'],
      handler: async () => { refreshImageLibrary(); },
    },
    {
      // Promote a character anchor to a trained Soul (hard identity lock). SPENDS credits
      // (reference sheet + Soul training) → GATED (deliberately NOT in AUTO_APPROVE). Async; the
      // transport polls to completion. Refreshes the library so the new Soul frames appear.
      id: 'director.trainSoul',
      namespace: 'director',
      label: 'Promote a character to a trained Soul ID (spends credits — identity lock)',
      params: ['anchorId', 'model'],
      handler: async (p: { anchorId?: string; model?: 'soul-2' | 'soul-cinematic' } = {}) => {
        if (!p.anchorId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Need a character anchorId to train a Soul.' }); return; }
        // Non-blocking: kick the async job; the global SoulTrainingWatcher notifies on completion.
        const r = await startSoulTraining(p.anchorId, p.model === 'soul-cinematic' ? 'soul-cinematic' : 'soul-2');
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:soul-training-started', { detail: { anchorId: p.anchorId } }));
        return r;
      },
    },
    {
      // Remove a character's Soul — clears the link + deletes local training frames. NO spend →
      // auto-approved (a structured-data cleanup, with a UI confirm). The Higgsfield-side Soul can't
      // be deleted via their CLI; the result's higgsfieldNote tells the user it remains there.
      id: 'director.removeSoul',
      namespace: 'director',
      label: 'Remove a character\'s Soul (clears the link + training frames — no spend)',
      params: ['anchorId'],
      handler: async (p: { anchorId?: string } = {}) => {
        if (!p.anchorId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Need a character anchorId to remove its Soul.' }); return; }
        const r = await removeSoul(p.anchorId);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:soul-refresh'));
        return r;
      },
    },
    {
      // Scene Director → ONE motion clip from a spec + motion. SPENDS video credits → gated (omitted
      // from AUTO_APPROVE). Lands in the Video Library; fires a refresh.
      id: 'director.renderClip',
      namespace: 'director',
      label: 'Render one motion clip from a Scene Director spec (spends video credits)',
      params: ['spec', 'motion', 'model', 'aspectRatio', 'durationS', 'firstFrameUrl', 'anchorId', 'brandKitId'],
      handler: async (p: { spec?: Record<string, unknown>; motion?: any; model?: string; aspectRatio?: string; durationS?: number; firstFrameUrl?: string; anchorId?: string; brandKitId?: string } = {}) => {
        const brandKitId = p.brandKitId || getState().composerBrandKitId || 'default';
        // anchorId → identity-locked clip (renders a Soul-locked still of the character, then animates it).
        const r = await renderDirectorClip(brandKitId, p.spec || {}, { motion: p.motion, model: p.model, aspectRatio: p.aspectRatio, durationS: p.durationS, firstFrameUrl: p.firstFrameUrl, anchorId: p.anchorId });
        refreshVideoLibrary();
        return r;
      },
    },
    {
      // Scene Director → one-shot render a STILL from a spec (the human "⚡ Generate" on the Images
      // Director). spec may carry `style` (photoreal/cartoon/3D/anime/…) + a free-text `description`.
      // SPENDS image credits → gated (omitted from AUTO_APPROVE). Lands in the brand image library.
      id: 'director.renderShot',
      namespace: 'director',
      label: 'One-shot render a still from a Scene Director spec (spends image credits)',
      params: ['spec', 'mode', 'aspectRatio', 'anchorId', 'brandKitId'],
      handler: async (p: { spec?: Record<string, unknown>; mode?: string; aspectRatio?: string; anchorId?: string; brandKitId?: string } = {}) => {
        const brandKitId = p.brandKitId || getState().composerBrandKitId || 'default';
        const r = await renderDirectorShot(brandKitId, {
          ...(p.spec || {}),
          renderMode: p.mode === 'single' ? 'single' : 'layered',
          aspectRatio: p.aspectRatio || '4:5',
          anchorId: p.anchorId || null,
        });
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh', { detail: { selectImageId: r.id } }));
        return r;
      },
    },
    {
      // Scene Director → gap-fill the numbered keyframe sequence into a short. SPENDS → gated.
      id: 'director.gapFill',
      namespace: 'director',
      label: 'Gap-fill the numbered keyframe sequence into a short (spends video credits)',
      params: ['keyframeIds', 'motion', 'model', 'aspectRatio', 'totalDurationS', 'directions', 'brandKitId'],
      handler: async (p: { keyframeIds?: string[]; motion?: any; model?: string; aspectRatio?: string; totalDurationS?: number; directions?: { description?: string; movement?: string; speed?: string; durationS?: number }[]; brandKitId?: string } = {}) => {
        const brandKitId = p.brandKitId || getState().composerBrandKitId || 'default';
        const ids = (p.keyframeIds && p.keyframeIds.length) ? p.keyframeIds : getState().videoKeyframes.map((k) => k.id);
        if (ids.length < 2) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Gap-fill needs ≥2 numbered keyframes.' }); return; }
        // directions[] = Generated Storyboard per-gap direction (one per gap); falls back to global motion.
        const r = await gapFillVideo(brandKitId, ids, { motion: p.motion, model: p.model, aspectRatio: p.aspectRatio, totalDurationS: p.totalDurationS, directions: p.directions });
        refreshVideoLibrary();
        return r;
      },
    },
    {
      // Video Editor (NLE) — the timeline is a serializable, agent-drivable EDL. These edits mutate
      // the SAME document the human widget does (the architectural tenet). Curation → auto-approved.
      id: 'editor.setTimeline',
      namespace: 'editor',
      label: 'Replace the whole Video Editor timeline (EDL)',
      params: ['timeline'],
      handler: (p: { timeline?: TimelineEDL } = {}) => { if (p.timeline) dispatch({ type: 'SET_TIMELINE', timeline: p.timeline }); },
    },
    {
      id: 'editor.addClip',
      namespace: 'editor',
      label: 'Append a clip to a Video Editor track',
      params: ['trackId', 'clip'],
      handler: (p: { trackId?: string; clip?: Clip } = {}) => {
        const trackId = p.trackId || getState().timeline.tracks.find((t) => t.kind === (p.clip?.kind === 'audio' ? 'audio' : p.clip?.kind === 'text' || p.clip?.kind === 'captions' ? 'text' : 'video'))?.id || getState().timeline.tracks[0]?.id;
        if (trackId && p.clip) dispatch({ type: 'TL_APPEND_CLIP', trackId, clip: p.clip });
      },
    },
    {
      id: 'editor.removeClip',
      namespace: 'editor',
      label: 'Remove a clip from the Video Editor timeline',
      params: ['trackId', 'clipId'],
      handler: (p: { trackId?: string; clipId?: string } = {}) => { if (p.trackId && p.clipId) dispatch({ type: 'TL_REMOVE_CLIP', trackId: p.trackId, clipId: p.clipId }); },
    },
    {
      id: 'editor.splitClip',
      namespace: 'editor',
      label: 'Split a clip at a timeline frame',
      params: ['trackId', 'clipId', 'atFrame'],
      handler: (p: { trackId?: string; clipId?: string; atFrame?: number } = {}) => { if (p.trackId && p.clipId && typeof p.atFrame === 'number') dispatch({ type: 'TL_SPLIT_CLIP', trackId: p.trackId, clipId: p.clipId, atFrame: p.atFrame }); },
    },
    {
      id: 'editor.patchClip',
      namespace: 'editor',
      label: 'Edit a clip\'s props (trim/volume/transform/transition)',
      params: ['trackId', 'clipId', 'patch'],
      handler: (p: { trackId?: string; clipId?: string; patch?: Partial<Clip> } = {}) => { if (p.trackId && p.clipId && p.patch) dispatch({ type: 'TL_PATCH_CLIP', trackId: p.trackId, clipId: p.clipId, patch: p.patch }); },
    },
    {
      // Render the timeline → MP4 via the (free, local) Remotion render service. A render → GATED.
      id: 'editor.render',
      namespace: 'editor',
      label: 'Render the Video Editor timeline to an MP4',
      params: ['format'],
      handler: async (p: { format?: string } = {}) => {
        const edl = getState().timeline;
        const r = await enqueueRender({ compositionId: 'Timeline', format: p.format || edl.format || 'reels', props: { tracks: edl.tracks, fps: edl.fps } as never });
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh'));
        return r;
      },
    },
    {
      // Images→Video bridge: stage library images as video keyframes. Marks them on the brain (so
      // they appear in the Video Library's Keyframes view), drops them into the keyframe tray, and
      // switches to the Video tab. Curation, NO spend → auto-approved.
      id: 'video.sendToVideo',
      namespace: 'video',
      label: 'Send images to the Video tab as keyframes',
      params: ['imageIds'],
      handler: async (p: { imageIds?: string[] } = {}) => {
        const ids = p.imageIds || [];
        if (!ids.length) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Need imageIds to send to the Video tab.' }); return; }
        await addKeyframes(ids);
        dispatch({ type: 'SET_TAB', tab: 'video' });
        refreshVideoLibrary();
      },
    },
    {
      // Demote a keyframe back to a standard image — clears the keyframe flag (the image is kept).
      // Curation, NO spend → auto-approved. Refreshes both libraries (the asset lives in both).
      id: 'video.removeKeyframe',
      namespace: 'video',
      label: 'Demote a keyframe back to a standard image (no spend)',
      params: ['imageId'],
      handler: async (p: { imageId?: string } = {}) => {
        if (!p.imageId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Need an imageId to remove a keyframe.' }); return; }
        await removeKeyframe(p.imageId);
        dispatch({ type: 'REMOVE_VIDEO_KEYFRAME', id: p.imageId });
        refreshVideoLibrary();
        refreshImageLibrary();
      },
    },
    {
      // Quote the LIVE credit cost of a Video Director output (read-only, NO spend) so the agent can
      // advise during the interview. Proxies `higgsfield generate cost`. Auto-approved.
      id: 'video.cost',
      namespace: 'video',
      label: 'Quote the live credit cost of a video output (no spend)',
      params: ['output', 'model', 'duration', 'aspectRatio', 'segments'],
      handler: async (p: { output?: string; model?: string; duration?: number; aspectRatio?: string; segments?: number } = {}) => {
        return getVideoCost({ output: p.output || 'clip', model: p.model || 'kling3_0_turbo', duration: p.duration, aspectRatio: p.aspectRatio, segments: p.segments });
      },
    },

    // --- Script (Audio Studio writer's room — Plan 1). Structured-data edits, NO spend → all
    // auto-approved. Every mutation returns the full ScriptDoc; we publish it to the shared
    // store (SET_ACTIVE_SCRIPT) so the Script panel + the agent stay in lockstep. `id` defaults
    // to the active script. The agent drives the SAME ids the human buttons do. ---
    ...(() => {
      // Resolve the target script id (explicit → active), or surface a friendly error.
      const sid = (p: { id?: string }): string | null => {
        const id = p.id ?? getState().activeScript?.script_id ?? null;
        if (!id) dispatch({ type: 'SET_STATUS', status: 'error', error: 'No active script — create one first.' });
        return id;
      };
      const publish = (s: import('@gitroom/frontend/components/studio/studio.types').ScriptDoc) => {
        dispatch({ type: 'SET_ACTIVE_SCRIPT', script: s });
        return s;
      };
      const sc = scriptClient;
      const caps: Capability[] = [
        {
          id: 'script.create', namespace: 'script', label: 'Create a new script (writer\'s room) and make it active',
          params: ['name', 'format', 'structure', 'targetDurationS'],
          handler: async (p: { name?: string; format?: any; structure?: any; targetDurationS?: number } = {}) => {
            if (!p.name?.trim()) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Script name required.' }); return; }
            const s = await sc.createScript({ name: p.name.trim(), format: p.format, structure: p.structure, targetDurationS: p.targetDurationS, brandKitId: getState().composerBrandKitId || 'default' });
            dispatch({ type: 'SET_TAB', tab: 'audio' });
            return publish(s);
          },
        },
        {
          id: 'script.select', namespace: 'script', label: 'Load a script by id and make it the active one',
          params: ['id'],
          handler: async (p: { id?: string } = {}) => { if (!p.id) return; return publish(await sc.getScript(p.id)); },
        },
        {
          id: 'script.update', namespace: 'script', label: 'Update the active script (name / format / target length / words-per-second)',
          params: ['id', 'name', 'format', 'targetDurationS', 'wordsPerSecond'],
          handler: async (p: any = {}) => { const id = sid(p); if (!id) return; return publish(await sc.updateScript(id, p)); },
        },
        {
          id: 'script.delete', namespace: 'script', label: 'Delete the active (or given) script',
          params: ['id'],
          handler: async (p: { id?: string } = {}) => {
            const id = sid(p); if (!id) return;
            await sc.deleteScript(id);
            if (getState().activeScript?.script_id === id) dispatch({ type: 'SET_ACTIVE_SCRIPT', script: null });
          },
        },
        {
          id: 'script.setStructure', namespace: 'script', label: 'Lay a structure spine onto the script (replaces beats with the time-budgeted skeleton)',
          params: ['id', 'structure', 'targetDurationS'],
          handler: async (p: { id?: string; structure?: any; targetDurationS?: number } = {}) => {
            const id = sid(p); if (!id || !p.structure) return; return publish(await sc.applyStructure(id, p.structure, p.targetDurationS));
          },
        },
        {
          id: 'script.addCharacter', namespace: 'script', label: 'Add a character to the cast',
          params: ['id', 'name', 'role', 'defaultTone'],
          handler: async (p: { id?: string; name?: string; role?: string; defaultTone?: any } = {}) => {
            const id = sid(p); if (!id || !p.name?.trim()) return; return publish(await sc.addCharacter(id, { name: p.name.trim(), role: p.role, defaultTone: p.defaultTone }));
          },
        },
        {
          id: 'script.updateCharacter', namespace: 'script', label: 'Update a cast character',
          params: ['id', 'charId', 'name', 'role', 'defaultTone'],
          handler: async (p: any = {}) => { const id = sid(p); if (!id || !p.charId) return; return publish(await sc.updateCharacter(id, p.charId, { name: p.name, role: p.role, default_tone: p.defaultTone })); },
        },
        {
          id: 'script.removeCharacter', namespace: 'script', label: 'Remove a cast character (its lines become narration)',
          params: ['id', 'charId'],
          handler: async (p: { id?: string; charId?: string } = {}) => { const id = sid(p); if (!id || !p.charId) return; return publish(await sc.removeCharacter(id, p.charId)); },
        },
        {
          id: 'script.addBeat', namespace: 'script', label: 'Add a beat',
          params: ['id', 'label', 'targetDurationS'],
          handler: async (p: { id?: string; label?: string; targetDurationS?: number } = {}) => { const id = sid(p); if (!id) return; return publish(await sc.addBeat(id, { label: p.label, target_duration_s: p.targetDurationS })); },
        },
        {
          id: 'script.updateBeat', namespace: 'script', label: 'Update a beat (label / timing)',
          params: ['id', 'beatId', 'label', 'targetStartS', 'targetDurationS'],
          handler: async (p: any = {}) => { const id = sid(p); if (!id || !p.beatId) return; return publish(await sc.updateBeat(id, p.beatId, { label: p.label, target_start_s: p.targetStartS, target_duration_s: p.targetDurationS })); },
        },
        {
          id: 'script.removeBeat', namespace: 'script', label: 'Remove a beat',
          params: ['id', 'beatId'],
          handler: async (p: { id?: string; beatId?: string } = {}) => { const id = sid(p); if (!id || !p.beatId) return; return publish(await sc.removeBeat(id, p.beatId)); },
        },
        {
          id: 'script.reorderBeats', namespace: 'script', label: 'Reorder beats',
          params: ['id', 'order'],
          handler: async (p: { id?: string; order?: string[] } = {}) => { const id = sid(p); if (!id || !p.order) return; return publish(await sc.reorderBeats(id, p.order)); },
        },
        {
          id: 'script.writeBeat', namespace: 'script', label: 'Write (replace) the lines of one beat',
          params: ['id', 'beatId', 'lines'],
          handler: async (p: { id?: string; beatId?: string; lines?: any[] } = {}) => { const id = sid(p); if (!id || !p.beatId) return; return publish(await sc.setBeatLines(id, p.beatId, (p.lines || []))); },
        },
        {
          id: 'script.addLine', namespace: 'script', label: 'Add one line to a beat',
          params: ['id', 'beatId', 'line'],
          handler: async (p: { id?: string; beatId?: string; line?: any } = {}) => { const id = sid(p); if (!id || !p.beatId || !p.line) return; return publish(await sc.addLine(id, p.beatId, p.line)); },
        },
        {
          id: 'script.setLineDirection', namespace: 'script', label: 'Set a line\'s tone and/or delivery direction',
          params: ['id', 'beatId', 'lineId', 'tone', 'direction'],
          handler: async (p: any = {}) => { const id = sid(p); if (!id || !p.beatId || !p.lineId) return; return publish(await sc.updateLine(id, p.beatId, p.lineId, { tone: p.tone, direction: p.direction })); },
        },
        {
          id: 'script.removeLine', namespace: 'script', label: 'Remove a line',
          params: ['id', 'beatId', 'lineId'],
          handler: async (p: { id?: string; beatId?: string; lineId?: string } = {}) => { const id = sid(p); if (!id || !p.beatId || !p.lineId) return; return publish(await sc.removeLine(id, p.beatId, p.lineId)); },
        },
        {
          id: 'script.reorderLines', namespace: 'script', label: 'Reorder the lines within a beat',
          params: ['id', 'beatId', 'order'],
          handler: async (p: { id?: string; beatId?: string; order?: string[] } = {}) => { const id = sid(p); if (!id || !p.beatId || !p.order) return; return publish(await sc.reorderLines(id, p.beatId, p.order)); },
        },
        {
          id: 'script.generateHooks', namespace: 'script', label: 'Publish 3-5 hook variants (tagged by pattern) for the script',
          params: ['id', 'hooks'],
          handler: async (p: { id?: string; hooks?: any[] } = {}) => { const id = sid(p); if (!id || !p.hooks) return; return publish(await sc.setHooks(id, p.hooks)); },
        },
        {
          id: 'script.selectHook', namespace: 'script', label: 'Select one hook variant (single-select)',
          params: ['id', 'hookId'],
          handler: async (p: { id?: string; hookId?: string } = {}) => { const id = sid(p); if (!id || !p.hookId) return; return publish(await sc.selectHook(id, p.hookId)); },
        },
        {
          id: 'script.suggestPronunciation', namespace: 'script', label: 'Set jargon pronunciation overrides',
          params: ['id', 'pronunciation'],
          handler: async (p: { id?: string; pronunciation?: any[] } = {}) => { const id = sid(p); if (!id || !p.pronunciation) return; return publish(await sc.setPronunciation(id, p.pronunciation)); },
        },
        {
          id: 'script.critique', namespace: 'script', label: 'Record an advisory critique of the script (read-only — changes no data)',
          params: ['id', 'assessment', 'suggestions'],
          handler: async () => { /* advisory only — the agent surfaces this in chat; no data change */ },
        },
        {
          id: 'script.bindToAd', namespace: 'script', label: 'Bind the active script to the active ad (project_addObject type=script)',
          params: ['id', 'adId'],
          handler: async (p: { id?: string; adId?: string } = {}) => {
            const id = sid(p); if (!id) return;
            const adId = p.adId ?? getState().activeAdId;
            if (!adId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'No active ad to bind the script to.' }); return; }
            await addObject({ adId, type: 'script', id });
          },
        },
        {
          // SPENDS TTS credits → deliberately NOT in AUTO_APPROVE (studio.tool-dispatcher.ts).
          id: 'script.generateVoicePreview', namespace: 'script', label: 'Render the active script as a single-voice VO preview (SPENDS TTS credits)',
          params: ['id', 'voiceId'],
          handler: async (p: { id?: string; voiceId?: string } = {}) => {
            const id = sid(p); if (!id) return;
            const voiceId = p.voiceId || getState().audioVoiceId;
            if (!voiceId) { dispatch({ type: 'SET_STATUS', status: 'error', error: 'Pick a voice first.' }); return; }
            const r = await voiceClient.generateVOFromScript({ scriptId: id, voiceId });
            // Let the Writer's Room canvas show the clip (mirrors the images/video refresh-event pattern).
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:script-vo', { detail: { url: r.url, scriptId: id } }));
            return r;
          },
        },
      ];
      return caps;
    })(),
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
