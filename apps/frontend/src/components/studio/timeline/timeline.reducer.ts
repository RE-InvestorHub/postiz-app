// Pure EDL operations — the timeline edit logic, used by BOTH the editor UI and the agent (the
// store dispatches these; the agent's capabilities call the same ones). Keeping them pure + here
// makes the timeline a true serializable, agent-drivable document.

import type { TimelineEDL, Clip, Track } from './timeline.contract';

function mapTrack(edl: TimelineEDL, trackId: string, fn: (t: Track) => Track): TimelineEDL {
  return { ...edl, tracks: edl.tracks.map((t) => (t.id === trackId ? fn(t) : t)) };
}

/** Add a clip to a track at the caller-set `from`. */
export function addClip(edl: TimelineEDL, trackId: string, clip: Clip): TimelineEDL {
  return mapTrack(edl, trackId, (t) => ({ ...t, clips: [...t.clips, clip] }));
}

/** Append a clip at the END of a track — `from` computed from CURRENT state (robust to rapid adds). */
export function appendClip(edl: TimelineEDL, trackId: string, clip: Clip): TimelineEDL {
  return mapTrack(edl, trackId, (t) => {
    const end = t.clips.reduce((m, x) => Math.max(m, x.from + x.durationInFrames), 0);
    return { ...t, clips: [...t.clips, { ...clip, from: end }] };
  });
}

/** Remove a clip from a track. */
export function removeClip(edl: TimelineEDL, trackId: string, clipId: string): TimelineEDL {
  return mapTrack(edl, trackId, (t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));
}

/** Shallow-patch a clip's fields (inspector: volume/transform/opacity/transition/from/duration/…). */
export function patchClip(edl: TimelineEDL, trackId: string, clipId: string, patch: Partial<Clip>): TimelineEDL {
  return mapTrack(edl, trackId, (t) => ({
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
  }));
}

/** Split a clip at an ABSOLUTE timeline frame → two adjacent clips (the tail trims into the source). */
export function splitClip(edl: TimelineEDL, trackId: string, clipId: string, atFrame: number): TimelineEDL {
  return mapTrack(edl, trackId, (t) => {
    const idx = t.clips.findIndex((c) => c.id === clipId);
    if (idx < 0) return t;
    const c = t.clips[idx];
    const localCut = atFrame - c.from;
    if (localCut <= 0 || localCut >= c.durationInFrames) return t; // cut outside the clip → no-op
    const headDur = localCut;
    const tailDur = c.durationInFrames - localCut;
    const head: Clip = { ...c, durationInFrames: headDur };
    const tail: Clip = {
      ...c,
      id: `${c.id}_b${Math.round(atFrame)}`,
      from: c.from + headDur,
      durationInFrames: tailDur,
      // video/audio clips advance their source in-point by the head length.
      ...((c.kind === 'video' || c.kind === 'audio') ? { inPoint: (c as any).inPoint ?? 0 + 0 } : {}),
    };
    if ((c.kind === 'video' || c.kind === 'audio')) {
      (tail as any).inPoint = ((c as any).inPoint ?? 0) + headDur;
    }
    const clips = [...t.clips.slice(0, idx), head, tail, ...t.clips.slice(idx + 1)];
    return { ...t, clips };
  });
}

/** Patch globals (fps / format / width / height). */
export function setGlobal(edl: TimelineEDL, patch: Partial<Pick<TimelineEDL, 'fps' | 'format' | 'width' | 'height'>>): TimelineEDL {
  return { ...edl, ...patch };
}

/** Add a track. */
export function addTrack(edl: TimelineEDL, track: Track): TimelineEDL {
  return { ...edl, tracks: [...edl.tracks, track] };
}

/** Find which track a clip lives on (helper for the UI/agent). */
export function trackOfClip(edl: TimelineEDL, clipId: string): string | null {
  for (const t of edl.tracks) if (t.clips.some((c) => c.id === clipId)) return t.id;
  return null;
}
