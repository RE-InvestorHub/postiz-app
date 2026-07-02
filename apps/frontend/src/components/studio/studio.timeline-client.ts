// Timeline persistence client — Save / Open / List / Delete named Video Editor projects (Layer-2).
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only. The Layer-1 localStorage
// autosave lives in the NLE itself (no network).

import type { TimelineEDL } from '@gitroom/frontend/components/studio/timeline/timeline.contract';

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init }); }
  catch (err: unknown) { throw new Error(`Could not reach the editor service: ${(err as Error)?.message ?? String(err)}`); }
  if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Editor service responded ${res.status}${d ? `: ${d}` : ''}`); }
  return (await res.json().catch(() => ({}))) as T;
}

export interface TimelineMeta { id: string; name: string; brandKitId: string; adId: string | null; clips: number; durationS: number; updatedAt: string; createdAt: string }
export interface TimelineRecord extends TimelineMeta { edl: TimelineEDL }

export function listTimelines(brandKitId?: string): Promise<{ timelines: TimelineMeta[] }> {
  return req(`/timelines${brandKitId ? `?brandKitId=${encodeURIComponent(brandKitId)}` : ''}`);
}
export function getTimeline(id: string): Promise<TimelineRecord> {
  return req(`/timelines/get?id=${encodeURIComponent(id)}`);
}
export function saveTimeline(payload: { id?: string; name: string; brandKitId: string; edl: TimelineEDL; adId?: string | null }): Promise<TimelineMeta> {
  return req('/timelines/save', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteTimeline(id: string): Promise<{ deleted: number }> {
  return req('/timelines/delete', { method: 'POST', body: JSON.stringify({ id }) });
}
