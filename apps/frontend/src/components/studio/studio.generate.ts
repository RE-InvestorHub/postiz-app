// Generation transport — the bridge from the Studio UI to the workspace
// brain/generation service (which holds the Higgsfield CLI + auth; that cannot
// run inside the Postiz container, so it lives host-side).
//
// Configured via NEXT_PUBLIC_BRAIN_URL. When unset, generation fails with a
// clear message — the manual upload path still works without it.

import { StudioResult, StudioTab } from '@gitroom/frontend/components/studio/studio.types';

const BRAIN_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '';

export interface GenerateArgs {
  tab: StudioTab;
  prompt: string;
  model: string;
  aspectRatio: string;
  resolution: string;
}

export async function generateAsset(args: GenerateArgs): Promise<StudioResult> {
  if (!BRAIN_URL) {
    throw new Error(
      'Generation service not configured. Set NEXT_PUBLIC_BRAIN_URL to the workspace brain service.'
    );
  }
  const res = await fetch(`${BRAIN_URL.replace(/\/+$/, '')}/studio/generate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Generation failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }
  const data = await res.json();
  if (!data?.url) {
    throw new Error('Generation service returned no asset URL.');
  }
  return {
    id: data.id || `gen_${Date.now()}`,
    url: data.url,
    tab: args.tab,
    prompt: args.prompt,
    createdAt: Date.now(),
  };
}
