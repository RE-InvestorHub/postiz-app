// Tool dispatcher — applies `tool_call` SSE events to the studio capability registry.
//
// The brain emits { name: "studio.setPrompt", input: { prompt: "..." } } and this
// module resolves the capability by id and invokes its handler. No React dependency.
//
// Called from the agent panel after the user approves the action (or immediately for
// auto-approved capabilities that are non-destructive reads/sets).

import { Capability } from '@gitroom/frontend/components/studio/studio.capabilities';

export interface DispatchResult {
  ok: boolean;
  /** Human-readable outcome for the chat log. */
  message: string;
}

/**
 * Normalize a brain tool name to a capability id.
 *
 * The brain emits underscore-separated names (`studio_setTab`) because the
 * Anthropic tool API disallows `.`; the capability registry is keyed by the
 * dotted id (`studio.setTab`). The namespace separator is the FIRST underscore;
 * method names are camelCase, so replacing only the first `_` is correct.
 */
export function toCapabilityId(toolName: string): string {
  return toolName.includes('.') ? toolName : toolName.replace('_', '.');
}

/**
 * Look up `toolName` in `caps` and invoke its handler with `input`.
 *
 * Returns a DispatchResult so the panel can log success/failure without
 * crashing the chat thread.
 */
export async function dispatchToolCall(
  toolName: string,
  input: Record<string, unknown>,
  caps: Record<string, Capability>
): Promise<DispatchResult> {
  const capId = toCapabilityId(toolName);
  const cap = caps[capId];

  if (!cap) {
    return {
      ok: false,
      message: `Unknown capability: ${capId}`,
    };
  }

  try {
    await cap.handler(input);
    return {
      ok: true,
      message: `Applied ${toolName}`,
    };
  } catch (err: unknown) {
    return {
      ok: false,
      message: `${toolName} failed: ${(err as Error)?.message ?? String(err)}`,
    };
  }
}

/**
 * Whether a tool call should be auto-approved (non-destructive studio setters)
 * vs. shown to the user for explicit Approve / Edit / Reject.
 *
 * v1 policy: setters are auto-approved; `studio.generate` requires approval
 * (it spends credits).
 */
export function requiresApproval(toolName: string): boolean {
  const AUTO_APPROVE = new Set([
    'studio.setTab',
    'studio.setPrompt',
    'studio.selectModel',
    'studio.setAspectRatio',
    'studio.setResolution',
    'studio.placeInSlot',
    // Avatar wizard prefill/navigation — UI state only. The consequential acts
    // (record consent, create clone) stay human-clicked in the wizard.
    'studio.avatarOpen',
    'studio.avatarSetConsent',
    'studio.avatarGotoStep',
    // Voice selection is UI-state only; studio.generateVO is NOT here (spends TTS credits).
    'studio.selectVoice',
    // Project (Content Composer) — all setters, no spend.
    'project.createCampaign',
    'project.createAd',
    'project.selectCampaign',
    'project.selectAd',
    'project.addObject',
    // Deletes are container/ref removals on a file-backed store — no render, no spend.
    'project.deleteCampaign',
    'project.deleteAd',
    // Renames are name patches — no render, no spend.
    'project.renameCampaign',
    'project.renameAd',
    // Composer — selectBrandKit is UI state; compose.composeStill is NOT here
    // (it runs a render → gated like the other spenders). compose.composeCarousel
    // and compose.composeEmail also render → deliberately NOT here (stay gated).
    'compose.selectBrandKit',
    // Brand Kit authoring is structured data, no spend.
    'compose.createBrandKit',
    'compose.updateBrandKit',
    // Brand entity — list/select/create/update/addLogo/delete are all structured-data
    // setters/curation, no spend → auto. (AI logo/voice GENERATION lands later, gated.)
    'brand.list',
    'brand.create',
    'brand.select',
    'brand.update',
    'brand.addLogo',
    'brand.delete',
    // brand.extract is a cheap text-LLM normalization (no image credits) → auto.
    'brand.extract',
    // AI-assist gap-fillers: palette/fonts/voice are deterministic/cheap-text → auto.
    // brand.generateLogos SPENDS image credits → deliberately NOT here (stays gated).
    'brand.completePalette',
    'brand.suggestFonts',
    'brand.draftVoice',
    // brand.exportKit packages a complete brand into a .zip download — read-only, no spend.
    'brand.exportKit',
    // brand.deriveSlot cuts a new slot from existing logos (crop/recolor/compose) — no spend.
    'brand.deriveSlot',
    // image.reshape resizes a library image to a channel size (ImageMagick) — no spend.
    'image.reshape',
    // image.edit (typed op) + image.magick (guarded chain) are FREE local raster edits — the
    // brain runs them sandboxed and records a new variant; the capability only refreshes. No spend.
    // (Generative, credit-spending edits are a separate, gated flow — deliberately NOT here.)
    'image.edit',
    'image.magick',
    // NOTE: director.trainSoul (promote a character to a trained Soul ID) SPENDS credits
    // (reference sheet + Soul training) → deliberately NOT here; it stays gated (human-confirmed).
    // director.removeSoul clears the Soul link + deletes local training frames — NO spend → auto.
    'director.removeSoul',
    // NOTE: director.renderShot / renderClip / gapFill all SPEND (image/video credits) → stay gated.
    // Video cost/plan PREVIEW — read-only, no spend (the actual run stays gated).
    'compose.estimateVideo',
    'compose.planVideo',
    // Templates — save/use are curation (no spend); the spend stays on compose.
    'template.useTemplate',
    'template.saveAsTemplate',
    // Video composer — accepting a shot is curation; startVideoRun / regenShot /
    // assembleVideo all SPEND and are deliberately NOT here (stay gated).
    'compose.acceptShot',
    // Data records — structured data; no spend.
    'data.createRecord',
    'data.setField',
    'data.removeField',
    'data.selectRecord',
    // Images→Video bridge — curation (mark/unmark keyframes), no spend.
    'video.sendToVideo',
    'video.removeKeyframe',
    // Live video cost quote — read-only proxy of `higgsfield generate cost`, NO spend → auto.
    'video.cost',
    // Video Editor timeline edits — mutate the EDL doc; no spend. (editor.render is GATED — omitted.)
    'editor.setTimeline',
    'editor.addClip',
    'editor.removeClip',
    'editor.splitClip',
    'editor.patchClip',
    // Plan 9 audio lanes — placing an EXISTING audio asset + setting its mix are structured EDL edits,
    // no spend (the render is the free timeline render). Generating a NEW SFX/music asset routes to the
    // Audio-tab gated sfx.generate / music.generate.
    'editor.addAudioClip',
    'editor.setAudioMix',
    'editor.addCaptions',
    'editor.saveTimeline',
    'editor.listTimelines',
    'editor.openTimeline',
    'editor.deleteTimeline',
    // Synthetic avatars — reads + free management are auto-approved. register / cast / reshootPortrait
    // are OMITTED (they spend image / voice / lip-sync credits) so they stay GATED.
    'synthetic.listSoulAnchors',
    'synthetic.listPortraitOptions',
    'synthetic.list',
    'synthetic.listEngines',
    'synthetic.setVoice',
    'synthetic.setEngine',
    'synthetic.archive',
    // Script (Audio writer's room) — ALL structured-data edits / advisory reads, NO spend → auto.
    // (Plan 1 renders nothing. Multi-voice render lands in Plan 2 and WILL be gated.)
    'script.create',
    'script.select',
    'script.update',
    'script.delete',
    'script.deleteMany',
    'script.setStructure',
    'script.addCharacter',
    'script.updateCharacter',
    'script.removeCharacter',
    'script.addBeat',
    'script.updateBeat',
    'script.removeBeat',
    'script.reorderBeats',
    'script.writeBeat',
    'script.addLine',
    'script.setLineDirection',
    'script.removeLine',
    'script.reorderLines',
    'script.generateHooks',
    'script.selectHook',
    'script.regenerateHook',
    'script.regenerateBeat',
    'script.realignToHook',
    'script.suggestPronunciation',
    'script.critique',
    'script.bindToAd',
    // audio.* (Plan 2) — assignments / reads / curation are free → auto-approved. The spenders
    // (audio.renderScript, audio.regenLine, audio.mirrorVoice) are deliberately OMITTED so they
    // stay GATED (they spend TTS / speech-to-speech credits).
    'audio.castVoice',
    'audio.listLibrary',
    'audio.assignToAd',
    'audio.deleteTrack',
    // Plan 3 — assembly is a FREE local mix; sfx/music LISTING + Jamendo search are free reads.
    // The two spenders (sfx.generate, music.generate) are deliberately OMITTED → GATED.
    'audio.assemble',
    'sfx.listLibrary',
    'music.listBeds',
    'music.searchJamendo',
  ]);
  return !AUTO_APPROVE.has(toCapabilityId(toolName));
}
