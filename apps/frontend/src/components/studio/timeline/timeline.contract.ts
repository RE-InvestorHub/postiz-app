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

/**
 * Audio-lane role (Plan 9). Audio tracks keep `kind: 'audio'` (so the composition + player treat them
 * identically) and carry a `role` that drives labels, colors, and the ducking semantics:
 *   dialogue = VO/speech (its spans drive the music duck) · sfx = one-shots · music = beds (duck-able).
 */
export type AudioRole = 'dialogue' | 'sfx' | 'music';

/** A clip's position + trim on the timeline. All frame values are at the timeline fps. */
export interface ClipBase {
  id: string;
  /** Timeline start frame. */
  from: number;
  /** Length on the timeline, in frames. */
  durationInFrames: number;
  /** Optional entrance transition at the clip's HEAD (fade/dissolve/slide/wipe/zoomBlur/iris/cube). */
  transitionIn?: { type: string; durationInFrames: number };
  /** Optional exit transition at the clip's TAIL (same types). */
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
  /** 0–1 linear level (legacy / simple). If `gainDb` is set it takes precedence. */
  volume?: number;
  // ── Plan 9 mixer fields ──────────────────────────────────────────────────
  /** Mixer gain in dB (0 = unity). Derived to a linear multiplier for preview + render. */
  gainDb?: number;
  /** Fade envelope on the clip's edges, in frames. */
  fadeInFrames?: number;
  fadeOutFrames?: number;
  /** Music clips: duck under the dialogue lane's speech spans while VO is present. */
  duck?: boolean;
  /**
   * Dialogue clips: speech spans in ms, relative to the clip's OWN source audio (as delivered by a
   * rendered VO track's `lineSpans`). The composition offsets these by the clip's placement + trim to
   * build the timeline-absolute duck envelope. Absent → the whole clip counts as speech for ducking.
   */
  spans?: { startMs: number; endMs: number }[];
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
  /** Highlight style id: 'pop' (active word scales up — default) | 'flat' (no scale). */
  styleId?: string;
  /** Active-word highlight background (hex). '' or 'none' = no background pill (just the popped word). */
  bgColor?: string;
  /** The dialogue clip these captions were generated from, so the inspector can find + edit them. */
  fromClipId?: string;
}

export type Clip = VideoClip | AudioClip | TextClip | CaptionClip;

export interface Track {
  id: string;
  kind: TrackKind;
  /** Audio-lane role (dialogue / sfx / music) — set on `kind: 'audio'` tracks. Drives duck + labels. */
  role?: AudioRole;
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
      { id: 'a-dialogue', kind: 'audio', role: 'dialogue', clips: [] },
      { id: 'a-sfx', kind: 'audio', role: 'sfx', clips: [] },
      { id: 'a-music', kind: 'audio', role: 'music', clips: [] },
      { id: 't1', kind: 'text', clips: [] },
    ],
  };
}

// ── Plan 9 mixer math (shared by the composition preview + render, so they mix identically) ──────

/** dB → linear amplitude multiplier (0 dB = 1.0). Mirrors the brain's `dbToLinear`. */
export function dbToLinear(db: number): number {
  return Math.pow(10, (Number(db) || 0) / 20);
}

/**
 * An audio clip's OWN volume at a LOCAL frame (0 = clip start): base level (gainDb if set, else the
 * legacy 0–1 `volume`) shaped by the edge fade-in / fade-out envelopes. Duck is applied separately.
 */
export function clipVolumeAt(clip: AudioClip, localFrame: number, _fps: number): number {
  const base = clip.gainDb != null ? dbToLinear(clip.gainDb) : (clip.volume ?? 1);
  const dur = clip.durationInFrames;
  let env = 1;
  const fi = clip.fadeInFrames ?? 0;
  const fo = clip.fadeOutFrames ?? 0;
  if (fi > 0 && localFrame < fi) env = Math.min(env, localFrame / fi);
  if (fo > 0 && localFrame > dur - fo) env = Math.min(env, Math.max(0, (dur - localFrame) / fo));
  return base * Math.max(0, env);
}

/**
 * Duck MULTIPLIER (1 = open, `duckRatio` = fully ducked) at time `t` seconds given VO `spans`
 * (seconds). Linear attack/release ramps of `ramp` seconds around each span. Mirrors the brain's
 * `musicbed.duckVolumeAt` (with base=1) so the NLE preview == the render == the Audio-tab assembly.
 */
export function duckVolumeAt(
  t: number,
  spans: { start: number; end: number }[] = [],
  opts: { duckRatio?: number; ramp?: number } = {}
): number {
  const duckRatio = opts.duckRatio ?? 0.3;
  const ramp = opts.ramp ?? 0.25;
  if (!spans.length) return 1;
  for (const s of spans) {
    const { start, end } = s;
    if (t >= start && t <= end) return duckRatio;
    if (t >= start - ramp && t < start) { const k = (t - (start - ramp)) / ramp; return 1 + (duckRatio - 1) * k; }
    if (t > end && t <= end + ramp) { const k = (t - end) / ramp; return duckRatio + (1 - duckRatio) * k; }
  }
  return 1;
}

/**
 * Timeline-absolute speech spans (seconds), collected from every non-muted dialogue-role audio track.
 * A dialogue clip's `spans` are ms in its own source; map to the timeline by its `from` + `inPoint`.
 * A dialogue clip with no `spans` counts as speech for its whole placed length. This is what the
 * music duck envelope reads.
 */
export function dialogueSpansSec(tracks: Track[], fps: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const t of tracks) {
    if (t.kind !== 'audio' || t.role !== 'dialogue' || t.hidden || t.muted) continue;
    for (const c of t.clips) {
      if (c.kind !== 'audio') continue;
      const fromSec = c.from / fps;
      const inSec = (c.inPoint ?? 0) / fps;
      const clipEndSec = (c.from + c.durationInFrames) / fps;
      if (c.spans && c.spans.length) {
        for (const sp of c.spans) {
          const start = Math.max(fromSec, fromSec + sp.startMs / 1000 - inSec);
          const end = Math.min(clipEndSec, fromSec + sp.endMs / 1000 - inSec);
          if (end > start) out.push({ start, end });
        }
      } else {
        out.push({ start: fromSec, end: clipEndSec });
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}
