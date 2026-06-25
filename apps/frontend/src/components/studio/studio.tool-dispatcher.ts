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
  ]);
  return !AUTO_APPROVE.has(toCapabilityId(toolName));
}
