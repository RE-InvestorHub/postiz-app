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

/** Opacity for a clip: short edge fade-in + a fade-out matching `transitionOut` (default cut). */
function useClipOpacity(durationInFrames: number, transitionOut?: { durationInFrames: number }, baseOpacity = 1): number {
  const frame = useCurrentFrame();
  const inLen = Math.min(8, Math.floor(durationInFrames * 0.2));
  const outLen = transitionOut?.durationInFrames
    ? Math.min(transitionOut.durationInFrames, Math.floor(durationInFrames * 0.5))
    : Math.min(8, Math.floor(durationInFrames * 0.2));
  const o = interpolate(
    frame,
    [0, inLen, durationInFrames - outLen, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  return o * baseOpacity;
}

const VideoClipView: React.FC<{ clip: VideoClip }> = ({ clip }) => {
  const opacity = useClipOpacity(clip.durationInFrames, clip.transitionOut, clip.opacity ?? 1);
  const t = clip.transform || {};
  const scale = t.scale ?? 1;
  // Normalized 0–1 center offsets → percentage translate.
  const tx = ((t.x ?? 0.5) - 0.5) * 100;
  const ty = ((t.y ?? 0.5) - 0.5) * 100;
  return (
    <AbsoluteFill style={{ opacity, transform: `translate(${tx}%, ${ty}%) scale(${scale})` }}>
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
  const opacity = useClipOpacity(clip.durationInFrames, clip.transitionOut);
  const s = clip.style || {};
  return (
    <AbsoluteFill style={{ opacity, justifyContent: 'center', alignItems: 'center' }}>
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

// Self-contained word-by-word highlighted captions: shows a small window of words around the active
// token, the active word emphasized. (T4 can swap richer styles in via the contract's styleId.)
const CaptionClipView: React.FC<{ clip: CaptionClip; fps: number }> = ({ clip, fps }) => {
  const frame = useCurrentFrame();
  const tokens = clip.tokens || [];
  const activeIdx = tokens.findIndex((t) => frame >= msToFrames(t.startMs, fps) && frame < msToFrames(t.endMs, fps));
  if (activeIdx < 0) return null;
  const start = Math.max(0, activeIdx - 3);
  const window = tokens.slice(start, start + 7);
  const scale = clip.styleId === 'scale';
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: '14%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10, maxWidth: '84%', fontFamily: 'Helvetica, Arial, sans-serif' }}>
        {window.map((t, i) => {
          const isActive = start + i === activeIdx;
          return (
            <span key={start + i} style={{
              color: isActive ? '#ffffff' : 'rgba(255,255,255,0.55)',
              backgroundColor: isActive && clip.styleId === 'background' ? '#d82d7e' : 'transparent',
              borderRadius: 8, padding: isActive && clip.styleId === 'background' ? '2px 10px' : 0,
              fontSize: 60, fontWeight: 800, lineHeight: 1.1,
              transform: isActive && scale ? 'scale(1.12)' : 'none',
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
