// Script client — transport for the Audio-tab writer's room (Plan 1).
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain), mirroring the other studio
// clients. Thin transport only; every mutation returns the full updated ScriptDoc.

import {
  ScriptDoc,
  ScriptFrameworks,
  ScriptFormat,
  ScriptStructure,
  ScriptTone,
  HookPattern,
} from '@gitroom/frontend/components/studio/studio.types';

export interface CreateScriptInput { name: string; format?: ScriptFormat; structure?: ScriptStructure; targetDurationS?: number; brandKitId?: string; defaultTone?: ScriptTone; }

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

function base(): string {
  return BRAIN_BASE.replace(/\/+$/, '');
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init });
  } catch (err: unknown) {
    throw new Error(`Could not reach the script service: ${(err as Error)?.message ?? String(err)}`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Script service responded ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}
const post = <T>(path: string, body: unknown) => req<T>(path, { method: 'POST', body: JSON.stringify(body) });

// --- reads ----------------------------------------------------------------
export async function listScripts(brandKitId?: string): Promise<ScriptDoc[]> {
  const q = brandKitId ? `?brandKitId=${encodeURIComponent(brandKitId)}` : '';
  const r = await req<{ scripts: ScriptDoc[] }>(`/scripts${q}`);
  return r.scripts || [];
}
export const getScript = (id: string) => req<ScriptDoc>(`/scripts/${encodeURIComponent(id)}`);
export const getFrameworks = (targetDurationS = 30) =>
  req<ScriptFrameworks>(`/scripts/frameworks?targetDurationS=${targetDurationS}`);

// --- script CRUD ----------------------------------------------------------
export const createScript = (payload: CreateScriptInput) =>
  post<ScriptDoc>('/scripts/create', payload);
export const updateScript = (id: string, patch: Partial<{ name: string; format: ScriptFormat; structure: ScriptStructure; targetDurationS: number; wordsPerSecond: number; brandKitId: string; defaultTone: ScriptTone }>) =>
  post<ScriptDoc>('/scripts/update', { id, patch });
export const deleteScript = (id: string) => post<{ ok: boolean }>('/scripts/delete', { id });
export const applyStructure = (id: string, structure: ScriptStructure, targetDurationS?: number) =>
  post<ScriptDoc>('/scripts/applyStructure', { id, structure, targetDurationS });

// --- beats ----------------------------------------------------------------
export const addBeat = (id: string, beat: Partial<{ label: string; target_start_s: number; target_duration_s: number }>) => post<ScriptDoc>('/scripts/addBeat', { id, beat });
export const updateBeat = (id: string, beatId: string, patch: Partial<{ label: string; target_start_s: number; target_duration_s: number }>) => post<ScriptDoc>('/scripts/updateBeat', { id, beatId, patch });
export const removeBeat = (id: string, beatId: string) => post<ScriptDoc>('/scripts/removeBeat', { id, beatId });
export const reorderBeats = (id: string, order: string[]) => post<ScriptDoc>('/scripts/reorderBeats', { id, order });

// --- lines ----------------------------------------------------------------
export interface LineInput { characterId?: string | null; text: string; tone?: ScriptTone | ''; direction?: string; sfxCue?: string; }
export const addLine = (id: string, beatId: string, line: LineInput) => post<ScriptDoc>('/scripts/addLine', { id, beatId, line: toLineBody(line) });
export const updateLine = (id: string, beatId: string, lineId: string, patch: Partial<LineInput>) => post<ScriptDoc>('/scripts/updateLine', { id, beatId, lineId, patch: toLineBody(patch) });
export const removeLine = (id: string, beatId: string, lineId: string) => post<ScriptDoc>('/scripts/removeLine', { id, beatId, lineId });
export const reorderLines = (id: string, beatId: string, order: string[]) => post<ScriptDoc>('/scripts/reorderLines', { id, beatId, order });
export const setBeatLines = (id: string, beatId: string, lines: LineInput[]) => post<ScriptDoc>('/scripts/setBeatLines', { id, beatId, lines: lines.map(toLineBody) });
// the brain's line shape uses snake_case character_id / sfx_cue; map the camelCase UI input.
function toLineBody(l: Partial<LineInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (l.characterId !== undefined) out.character_id = l.characterId;
  if (l.text !== undefined) out.text = l.text;
  if (l.tone !== undefined) out.tone = l.tone;
  if (l.direction !== undefined) out.direction = l.direction;
  if (l.sfxCue !== undefined) out.sfx_cue = l.sfxCue;
  return out;
}

// --- cast -----------------------------------------------------------------
export const addCharacter = (id: string, character: { name: string; role?: string; defaultTone?: ScriptTone }) =>
  post<ScriptDoc>('/scripts/addCharacter', { id, character: { name: character.name, role: character.role, default_tone: character.defaultTone } });
export const updateCharacter = (id: string, charId: string, patch: Partial<{ name: string; role: string; default_tone: ScriptTone }>) =>
  post<ScriptDoc>('/scripts/updateCharacter', { id, charId, patch });
export const removeCharacter = (id: string, charId: string) => post<ScriptDoc>('/scripts/removeCharacter', { id, charId });

// --- hooks ----------------------------------------------------------------
export const setHooks = (id: string, hooks: Array<{ pattern: HookPattern; text: string; selected?: boolean }>) => post<ScriptDoc>('/scripts/setHooks', { id, hooks });
export const selectHook = (id: string, hookId: string) => post<ScriptDoc>('/scripts/selectHook', { id, hookId });

// --- pronunciation --------------------------------------------------------
export const setPronunciation = (id: string, pronunciation: Array<{ term: string; phonetic?: string }>) => post<ScriptDoc>('/scripts/setPronunciation', { id, pronunciation });

// ---------------------------------------------------------------------------
// Budget — mirrors the brain's pure computeBudget so the meter is instant (no round-trip).
// ~2.6 spoken words/sec by default; the last beat is NOT special here (display only).
// ---------------------------------------------------------------------------
export function wordCount(text: string): number {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}
export interface ScriptBudget {
  wordsPerSecond: number;
  targetDurationS: number;
  totalWords: number;
  totalSeconds: number;
  deltaSeconds: number;
  overBudget: boolean;
  beats: Array<{ id: string; label: string; words: number; seconds: number; targetDurationS: number; overBudget: boolean }>;
}
export function computeBudget(script: ScriptDoc | null): ScriptBudget {
  const wps = script?.words_per_second || 2.6;
  const target = script?.target_duration_s || 0;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  const beats = (script?.beats || []).map((b) => {
    const words = (b.lines || []).reduce((n, l) => n + wordCount(l.text), 0);
    const seconds = words / wps;
    return { id: b.id, label: b.label, words, seconds: round1(seconds), targetDurationS: b.target_duration_s, overBudget: b.target_duration_s > 0 && seconds > b.target_duration_s };
  });
  const totalWords = beats.reduce((n, b) => n + b.words, 0);
  const totalSeconds = round1(totalWords / wps);
  return {
    wordsPerSecond: wps,
    targetDurationS: target,
    totalWords,
    totalSeconds,
    deltaSeconds: target > 0 ? round1(totalSeconds - target) : 0,
    overBudget: target > 0 && totalSeconds > target,
    beats,
  };
}
