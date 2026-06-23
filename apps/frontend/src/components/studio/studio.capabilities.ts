// Studio capability registry — the "levers".
//
// Every control the human can operate is expressed here as a namespaced
// capability (`studio.*`). The manual UI dispatches these; the agent (pop-out
// panel) will call the SAME ids. This is the extension point: future domains
// (`schedule.*`, `channels.*`, `analytics.*`) register alongside these without
// touching the panel or the brain — see the plan task
// `agent-control-surface-and-registry`.

import { Dispatch } from 'react';
import { StudioAction } from '@gitroom/frontend/components/studio/studio.store';
import {
  StudioState,
  StudioResult,
  StudioTab,
} from '@gitroom/frontend/components/studio/studio.types';

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
}

/**
 * Build the live `studio.*` capability map bound to a store dispatch + a
 * generation transport. Returned as an id→Capability record so the manual UI
 * and the agent resolve actions identically.
 */
export function buildStudioCapabilities(
  deps: StudioCapabilityDeps
): Record<string, Capability> {
  const { dispatch, getState, generate } = deps;
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
