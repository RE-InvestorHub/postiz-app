// Timeline EDL (edit-decision list) contract — the spine of the multi-track NLE (Plan 3).
//
// This is the SINGLE shared data contract that three things speak:
//   1. the editor UI + the agent (in the fork) MUTATE it (store-backed, agent-drivable),
//   2. @remotion/player PREVIEWS it (in the fork),
//   3. the `Timeline` Remotion composition RENDERS it (here in video/src, + the render service).
//
// VENDOR-IDENTICAL: this file is duplicated into the fork
// (postiz/apps/frontend/src/components/studio/timeline/timeline.contract.ts) — types only, so drift
// risk is minimal. Keep the two copies byte-identical when either changes.

/** A timed caption token (word) — matches @remotion/captions' Caption shape. */
export interface CaptionToken {
  text: string;
  startMs: number;
  endMs: number;
}

export type TrackKind = 'video' | 'audio' | 'text' | 'captions';

/** A clip's position + trim on the timeline. All frame values are at the timeline fps. */
export interface ClipBase {
  id: string;
  /** Timeline start frame. */
  from: number;
  /** Length on the timeline, in frames. */
  durationInFrames: number;
  /** Optional cross-fade out at the clip's tail (frames). The next clip fades in to match. */
  transitionOut?: { type: string; durationInFrames: number };
}

export interface VideoClip extends ClipBase {
  kind: 'video';
  /** Library asset id (provenance). */
  srcId: string;
  /** Playable URL (same-origin /api/brain/assets/… or a CDN url). */
  srcUrl: string;
  /** Trim into the SOURCE: first source frame to play (frames). */
  inPoint?: number;
  /** 0–1 opacity. */
  opacity?: number;
  /** Normalized transform over the frame ({x,y} 0–1 center, scale). */
  transform?: { x?: number; y?: number; scale?: number };
  /** 0–1 audio level of the clip's own audio. */
  volume?: number;
}

export interface AudioClip extends ClipBase {
  kind: 'audio';
  srcId: string;
  srcUrl: string;
  inPoint?: number;
  volume?: number;
}

export interface TextClip extends ClipBase {
  kind: 'text';
  text: string;
  /** Normalized position + style. */
  style?: { x?: number; y?: number; size?: number; color?: string; weight?: number; align?: 'left' | 'center' | 'right' };
}

export interface CaptionClip extends ClipBase {
  kind: 'captions';
  /** Word-level tokens (from ElevenLabs alignment → @remotion/captions). */
  tokens: CaptionToken[];
  /** Highlight style id (colored | scale | background). */
  styleId?: string;
}

export type Clip = VideoClip | AudioClip | TextClip | CaptionClip;

export interface Track {
  id: string;
  kind: TrackKind;
  /** Default false. Hidden/muted tracks render nothing. */
  hidden?: boolean;
  muted?: boolean;
  clips: Clip[];
}

/** The whole edit. Width/height/durationInFrames are derived by the composition's calculateMetadata. */
export interface TimelineEDL {
  fps: number;
  width: number;
  height: number;
  /** Output format key (reels | feed | youtube | story) — the render service maps to dims. */
  format?: string;
  tracks: Track[];
}

/** The last frame any clip occupies — the edit's natural length. */
export function edlDuration(edl: TimelineEDL): number {
  let last = 0;
  for (const t of edl.tracks) {
    if (t.hidden) continue;
    for (const c of t.clips) last = Math.max(last, (c.from ?? 0) + (c.durationInFrames ?? 0));
  }
  return Math.max(1, last);
}

/** An empty timeline at a given format/fps/dims. */
export function emptyEDL(opts: Partial<TimelineEDL> = {}): TimelineEDL {
  return {
    fps: opts.fps ?? 30,
    width: opts.width ?? 1080,
    height: opts.height ?? 1920,
    format: opts.format ?? 'reels',
    tracks: opts.tracks ?? [
      { id: 'v1', kind: 'video', clips: [] },
      { id: 'a1', kind: 'audio', clips: [] },
      { id: 't1', kind: 'text', clips: [] },
    ],
  };
}
