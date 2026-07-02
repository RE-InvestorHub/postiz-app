// Timeline — the parametric multi-track NLE compositor (Plan 3). Renders a TimelineEDL: each track's
// clips become <Sequence>s (video / audio / text / captions), positioned by `from` + `durationInFrames`,
// trimmed by `inPoint`, with edge/transition fades. Tracks render bottom→top in array order.
//
// This component is VENDOR-IDENTICAL with the fork's @remotion/player preview copy — keep them in sync.
// Duration/fps/dims come from props via calculateMetadata in Root.tsx.

// SELF-CONTAINED: depends only on `remotion` + `./contract`, so this exact file is vendored into the
// fork for the @remotion/player preview (keep the two copies identical).
import React from 'react';
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { TimelineEDL, VideoClip, AudioClip, TextClip, CaptionClip, Clip, Track } from './timeline.contract';
import { clipVolumeAt, duckVolumeAt, dialogueSpansSec } from './timeline.contract';

const msToFrames = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

type DuckSpan = { start: number; end: number };

type Trans = { type?: string; durationInFrames?: number };
type EdgeStyle = { opacity: number; transform: string; filter?: string; clipPath?: string };

// A single transition's contribution at "amount" a (0 = clip fully present, 1 = fully entered/exited).
// dir 'in' plays the effect resolving TO present; 'out' plays it leaving. Distinct look per type.
function transDelta(type: string | undefined, a: number, dir: 'in' | 'out') {
  const d = { opacity: 1, scaleMul: 1, txAdd: 0, blur: 0, clipPath: undefined as string | undefined };
  switch (type) {
    case 'fade': case 'dissolve': d.opacity = 1 - a; break;
    case 'zoomBlur': d.opacity = 1 - a; d.scaleMul = 1 + 0.45 * a; d.blur = 18 * a; break;
    case 'slide': d.txAdd = (dir === 'in' ? 100 : -100) * a; break;                       // in: from right, out: to left
    case 'wipe': d.clipPath = dir === 'in' ? `inset(0 0 0 ${100 * a}%)` : `inset(0 ${100 * a}% 0 0)`; break;
    case 'iris': d.clipPath = `circle(${(1 - a) * 75}% at 50% 50%)`; break;               // circular reveal / close
    case 'cube': d.opacity = 1 - a * 0.55; d.scaleMul = 1 - 0.18 * a; d.txAdd = (dir === 'in' ? 70 : -70) * a; break;
    default: d.opacity = 1 - a; break;                                                    // unknown → fade
  }
  return d;
}

/** Combined head + tail transition style for a clip. `cut`/absent edge = a hard cut (no effect). */
function useEdgeTransition(
  durationInFrames: number,
  transitionIn: Trans | undefined,
  transitionOut: Trans | undefined,
  baseTransform: { x?: number; y?: number; scale?: number } | undefined,
  baseOpacity = 1
): EdgeStyle {
  const frame = useCurrentFrame();
  const inLen = transitionIn?.durationInFrames ? Math.min(transitionIn.durationInFrames, Math.floor(durationInFrames * 0.6)) : 0;
  const outLen = transitionOut?.durationInFrames ? Math.min(transitionOut.durationInFrames, Math.floor(durationInFrames * 0.6)) : 0;
  const pin = inLen > 0 ? interpolate(frame, [0, inLen], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 1;
  const pout = outLen > 0 ? interpolate(frame, [durationInFrames - outLen, durationInFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) : 0;

  const bt = baseTransform || {};
  let opacity = baseOpacity, scaleMul = 1, txAdd = 0, blur = 0;
  let clipPath: string | undefined;
  if (pin < 1) { const d = transDelta(transitionIn?.type, 1 - pin, 'in'); opacity *= d.opacity; scaleMul *= d.scaleMul; txAdd += d.txAdd; blur += d.blur; if (d.clipPath) clipPath = d.clipPath; }
  if (pout > 0) { const d = transDelta(transitionOut?.type, pout, 'out'); opacity *= d.opacity; scaleMul *= d.scaleMul; txAdd += d.txAdd; blur += d.blur; if (d.clipPath) clipPath = d.clipPath; }

  const scale = (bt.scale ?? 1) * scaleMul;
  const tx = ((bt.x ?? 0.5) - 0.5) * 100 + txAdd;
  const ty = ((bt.y ?? 0.5) - 0.5) * 100;
  return { opacity, transform: `translate(${tx}%, ${ty}%) scale(${scale})`, filter: blur > 0 ? `blur(${blur.toFixed(1)}px)` : undefined, clipPath };
}

const VideoClipView: React.FC<{ clip: VideoClip }> = ({ clip }) => {
  const { opacity, transform, filter, clipPath } = useEdgeTransition(clip.durationInFrames, clip.transitionIn, clip.transitionOut, clip.transform, clip.opacity ?? 1);
  return (
    <AbsoluteFill style={{ opacity, transform, filter, clipPath }}>
      <OffthreadVideo
        src={clip.srcUrl}
        trimBefore={clip.inPoint ?? 0}
        volume={clip.volume ?? 1}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </AbsoluteFill>
  );
};

// Audio clip: gain (dB or legacy 0–1) shaped by edge fades, and — for a music clip with `duck` on —
// dipped under the dialogue lane's speech spans. `volume` is a per-frame fn; the frame is LOCAL to the
// clip's <Sequence> (0 = clip start), so `clip.from + f` recovers the timeline-absolute time for duck.
const AudioClipView: React.FC<{ clip: AudioClip; fps: number; duckSpans: DuckSpan[] }> = ({ clip, fps, duckSpans }) => {
  const doDuck = !!clip.duck && duckSpans.length > 0;
  const volume = (f: number): number => {
    const own = clipVolumeAt(clip, f, fps);
    if (!doDuck) return own;
    return own * duckVolumeAt((clip.from + f) / fps, duckSpans, { duckRatio: 0.3, ramp: 0.25 });
  };
  return <Audio src={clip.srcUrl} trimBefore={clip.inPoint ?? 0} volume={volume} />;
};

const TextClipView: React.FC<{ clip: TextClip }> = ({ clip }) => {
  const { opacity, transform, filter, clipPath } = useEdgeTransition(clip.durationInFrames, clip.transitionIn, clip.transitionOut, undefined, 1);
  const s = clip.style || {};
  return (
    <AbsoluteFill style={{ opacity, transform, filter, clipPath, justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          left: `${(s.x ?? 0.5) * 100}%`,
          top: `${(s.y ?? 0.85) * 100}%`,
          transform: 'translate(-50%, -50%)',
          color: s.color ?? '#ffffff',
          fontSize: s.size ?? 64,
          fontWeight: s.weight ?? 700,
          textAlign: s.align ?? 'center',
          textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          maxWidth: '88%',
          fontFamily: 'Helvetica, Arial, sans-serif',
        }}
      >
        {clip.text}
      </div>
    </AbsoluteFill>
  );
};

// Word-by-word highlighted captions: a small window of words around the active token, the active word
// "popped" (scaled up) with an optional coloured background pill. styleId 'pop' (default) scales the
// active word; 'flat' keeps it same-size. bgColor ('' | 'none' → no pill) tints the highlight.
const CaptionClipView: React.FC<{ clip: CaptionClip; fps: number }> = ({ clip, fps }) => {
  const frame = useCurrentFrame();
  const tokens = clip.tokens || [];
  const activeIdx = tokens.findIndex((t) => frame >= msToFrames(t.startMs, fps) && frame < msToFrames(t.endMs, fps));
  if (activeIdx < 0) return null;
  const start = Math.max(0, activeIdx - 3);
  const window = tokens.slice(start, start + 7);
  const pop = (clip.styleId ?? 'pop') === 'pop';
  const bg = clip.bgColor && clip.bgColor !== 'none' ? clip.bgColor : null;
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '14%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: '84%', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        {window.map((t, i) => {
          const isActive = start + i === activeIdx;
          return (
            <span key={start + i} style={{
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
              backgroundColor: isActive && bg ? bg : 'transparent',
              borderRadius: 10, padding: isActive && bg ? '2px 14px' : '2px 0',
              fontSize: 60, fontWeight: 800, lineHeight: 1.15,
              transform: isActive && pop ? 'scale(1.14)' : 'none',
              transformOrigin: 'center bottom',
              textShadow: '0 2px 12px rgba(0,0,0,0.7)',
            }}>{t.text.trim()}</span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const ClipView: React.FC<{ clip: Clip; fps: number; duckSpans: DuckSpan[] }> = ({ clip, fps, duckSpans }) => {
  switch (clip.kind) {
    case 'video': return <VideoClipView clip={clip} />;
    case 'audio': return <AudioClipView clip={clip} fps={fps} duckSpans={duckSpans} />;
    case 'text': return <TextClipView clip={clip} />;
    case 'captions': return <CaptionClipView clip={clip} fps={fps} />;
    default: return null;
  }
};

const TrackView: React.FC<{ track: Track; fps: number; duckSpans: DuckSpan[] }> = ({ track, fps, duckSpans }) => {
  if (track.hidden) return null;
  return (
    <>
      {track.clips.map((clip) => {
        if (track.muted && (clip.kind === 'audio')) return null;
        return (
          <Sequence key={clip.id} from={clip.from} durationInFrames={clip.durationInFrames} name={`${track.kind}:${clip.id}`}>
            <ClipView clip={clip} fps={fps} duckSpans={duckSpans} />
          </Sequence>
        );
      })}
    </>
  );
};

export interface TimelineProps {
  tracks?: Track[];
  fps?: number;
}

export const Timeline: React.FC<TimelineProps> = ({ tracks = [] }) => {
  const { fps } = useVideoConfig();
  // Speech spans (timeline-absolute seconds) from the dialogue lane(s) — the music duck reads these.
  // Computed once here so every ducked music clip mixes against the SAME envelope (preview == render).
  const duckSpans = dialogueSpansSec(tracks, fps);
  return (
    <AbsoluteFill style={{ backgroundColor: '#000000', overflow: 'hidden' }}>
      {tracks.map((track) => (
        <TrackView key={track.id} track={track} fps={fps} duckSpans={duckSpans} />
      ))}
    </AbsoluteFill>
  );
};

export type { TimelineEDL };
