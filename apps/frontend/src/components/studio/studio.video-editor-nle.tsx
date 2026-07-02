'use client';

// Video Editor — the multi-track NLE (Plan 3) + audio lanes / mix (Plan 9). Layout (user-approved):
// a source-bin LIBRARY (left, now tabbed Video · Dialogue · SFX · Music) + a @remotion/player CANVAS of
// the composed edit (center) + an INSPECTOR (right, on clip-select), over a full-width multi-track
// TIMELINE (bottom, @xzdarcy/react-timeline-editor) with a lane-label column. The edit is the store's
// `timeline` EDL — the single, serializable, agent-drivable document. Postiz tokens only; magenta
// `bg-ai` reserved for the credit-spending (AI SFX / AI music) actions.
//
// Audio mixing note: the @remotion/player renders the SAME Timeline composition as the render service,
// and that composition (Plan 9 T2) already applies each audio clip's gain/fade and ducks music under
// the dialogue lane's speech spans. So the player preview mixes IDENTICALLY to the export — there is no
// separate Web Audio graph (which would double the audio and risk drifting from the render).

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Timeline as TimelineWidget, TimelineState, TimelineRow, TimelineAction } from '@xzdarcy/react-timeline-editor';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { Timeline as TimelineComposition } from '@gitroom/frontend/components/studio/timeline/timeline.composition';
import { edlDuration, emptyEDL, dbToLinear, TimelineEDL, Clip, VideoClip, AudioClip, Track, AudioRole } from '@gitroom/frontend/components/studio/timeline/timeline.contract';
import { trackOfClip } from '@gitroom/frontend/components/studio/timeline/timeline.reducer';
import { listVideoLibrary, BrandClip } from '@gitroom/frontend/components/studio/studio.video-client';
import { enqueueRender, pollRenderJob, fetchFormats, FormatMeta } from '@gitroom/frontend/components/studio/studio.remotion-client';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { listAudioLibrary, AudioTrack } from '@gitroom/frontend/components/studio/studio.voice-client';
import {
  listSfxLibrary, listMusicBeds, searchJamendo, pickJamendo, generateSfx, generateMusic, fetchAudioPeaks,
  SfxItem, MusicBed, JamendoTrack,
} from '@gitroom/frontend/components/studio/studio.assemble-client';

const EFFECTS = { default: { id: 'default', name: 'clip' } };
const TRANSITIONS = ['cut', 'fade', 'dissolve', 'slide', 'wipe', 'zoomBlur', 'iris', 'cube'];
// Same event the Audio tab fires after a render/assemble; the bin re-reads /audio/library on it.
const AUDIO_LIB_REFRESH = 'reinvestorhub:audio-library-refresh';

// Clip fill by lane — video/text keep the Plan-3 colors; audio lanes get one hue each.
const LANE_COLOR: Record<string, string> = {
  video: '#d82d7e', dialogue: '#612bd3', sfx: '#e0932b', music: '#2ea86a', text: '#0ea5a4', captions: '#0ea5a4',
};
const laneColorOf = (t?: Track): string =>
  !t ? '#888' : t.kind === 'audio' ? (LANE_COLOR[t.role || 'dialogue'] || '#612bd3') : (LANE_COLOR[t.kind] || '#888');
const laneLabelOf = (t: Track): string =>
  t.kind === 'video' ? 'Video' : t.kind === 'text' ? 'Text' : t.kind === 'captions' ? 'Captions'
    : (t.role ? t.role[0].toUpperCase() + t.role.slice(1) : 'Audio');

// EDL → widget rows (frames → seconds). The widget edits start/end in seconds.
function edlToRows(edl: TimelineEDL): TimelineRow[] {
  const fps = edl.fps || 30;
  return edl.tracks.map((t) => ({
    id: t.id,
    actions: t.clips.map((c) => ({ id: c.id, start: c.from / fps, end: (c.from + c.durationInFrames) / fps, effectId: 'default' })),
  }));
}

// widget rows → EDL (seconds → frames), preserving each clip's metadata by id.
function rowsToEdl(rows: TimelineRow[], prev: TimelineEDL): TimelineEDL {
  const fps = prev.fps || 30;
  const byId = new Map<string, Clip>();
  for (const t of prev.tracks) for (const c of t.clips) byId.set(c.id, c);
  const tracks = prev.tracks.map((t) => {
    const row = rows.find((r) => r.id === t.id);
    if (!row) return t;
    const clips = row.actions
      .map((a) => {
        const base = byId.get(a.id);
        if (!base) return null;
        return { ...base, from: Math.round(a.start * fps), durationInFrames: Math.max(1, Math.round((a.end - a.start) * fps)) } as Clip;
      })
      .filter(Boolean) as Clip[];
    return { ...t, clips };
  });
  return { ...prev, tracks };
}

const card = 'rounded-[8px] border border-newBorder bg-newBgColor';
const ROW_H = 30;
const RULER_H = 32; // the widget's time-ruler height — the label column clears it with this top pad.

// Tiny inline waveform for an audio clip's timeline block. Peaks are normalized 0–1 (brain-side).
const WaveBars: FC<{ peaks: number[]; color: string }> = ({ peaks, color }) => {
  const sample = peaks.length > 56 ? peaks.filter((_, i) => i % Math.ceil(peaks.length / 56) === 0) : peaks;
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 1, padding: '0 4px', opacity: 0.9 }}>
      {sample.map((p, i) => (
        <div key={i} style={{ flex: 1, height: `${Math.max(6, Math.round(p * 100))}%`, background: color, borderRadius: 1 }} />
      ))}
    </div>
  );
};

export const StudioVideoEditorNLE: FC = () => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const brandKitId = state.composerBrandKitId || 'default';
  const edl = state.timeline;
  const fps = edl.fps || 30;

  const [clips, setClips] = useState<BrandClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [formats, setFormats] = useState<Record<string, FormatMeta> | null>(null);
  const [format, setFormat] = useState('reels');
  const [rendering, setRendering] = useState(false);
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  // Audio bin (Plan 9).
  const [bin, setBin] = useState<'video' | 'dialogue' | 'sfx' | 'music'>('video');
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
  const [sfx, setSfx] = useState<SfxItem[]>([]);
  const [beds, setBeds] = useState<MusicBed[]>([]);
  const [jamQ, setJamQ] = useState('');
  const [jam, setJam] = useState<{ configured: boolean; tracks: JamendoTrack[]; note?: string } | null>(null);
  const [jamBusy, setJamBusy] = useState(false);
  const [genText, setGenText] = useState('');
  const [genBusy, setGenBusy] = useState(false);
  const [confirmGen, setConfirmGen] = useState<null | 'sfx' | 'music'>(null);
  const [peaks, setPeaks] = useState<Record<string, number[]>>({});
  const [addingLane, setAddingLane] = useState(false);

  const playerRef = useRef<PlayerRef>(null);
  const timelineState = useRef<TimelineState>(null);

  // Source bins + export formats.
  useEffect(() => { listVideoLibrary(brandKitId).then((l) => setClips(l.clips)).catch(() => {}); }, [brandKitId]);
  useEffect(() => { fetchFormats().then((f) => f && setFormats(f)).catch(() => {}); }, []);
  const loadAudio = useCallback(() => {
    listAudioLibrary(brandKitId).then((r) => setAudioTracks((r.tracks || []).filter((t) => t.stage === 'rendered' || t.stage === 'voiceover'))).catch(() => {});
  }, [brandKitId]);
  useEffect(() => { loadAudio(); }, [loadAudio]);
  useEffect(() => { listSfxLibrary().then((r) => setSfx(r.sfx || [])).catch(() => {}); }, []);
  useEffect(() => { listMusicBeds().then((r) => setBeds(r.beds || [])).catch(() => {}); }, []);
  // Pick up clips + rendered VO produced elsewhere while the editor is open.
  useEffect(() => {
    const onVideo = () => listVideoLibrary(brandKitId).then((l) => setClips(l.clips)).catch(() => {});
    const onAudio = () => loadAudio();
    if (typeof window !== 'undefined') {
      window.addEventListener('reinvestorhub:video-refresh', onVideo);
      window.addEventListener(AUDIO_LIB_REFRESH, onAudio);
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('reinvestorhub:video-refresh', onVideo);
        window.removeEventListener(AUDIO_LIB_REFRESH, onAudio);
      }
    };
  }, [brandKitId, loadAudio]);

  // Fetch waveform peaks for any audio clip on the timeline we haven't fetched yet (cache by srcId;
  // a stored empty array marks "tried" so we don't refetch on failure).
  useEffect(() => {
    const need = new Set<string>();
    for (const t of edl.tracks) if (t.kind === 'audio') for (const c of t.clips) if (c.kind === 'audio' && !(c.srcId in peaks)) need.add(c.srcId);
    need.forEach((id) => fetchAudioPeaks(id, 300).then((p) => setPeaks((m) => ({ ...m, [id]: p.peaks || [] }))).catch(() => setPeaks((m) => ({ ...m, [id]: [] }))));
  }, [edl, peaks]);

  const durationInFrames = Math.max(1, edlDuration(edl));
  const rows = useMemo(() => edlToRows(edl), [edl]);
  // Fit the timeline to exactly its lanes (ruler + one ROW_H per track) so there's no dead space;
  // grows automatically as tracks are added/removed.
  const timelineHeight = RULER_H + edl.tracks.length * ROW_H;

  const selected = useMemo(() => {
    for (const t of edl.tracks) { const c = t.clips.find((x) => x.id === selectedClipId); if (c) return { clip: c, track: t }; }
    return null;
  }, [edl, selectedClipId]);

  const playheadFrame = useCallback(() => Math.max(0, Math.round((timelineState.current?.getTime?.() ?? 0) * fps)), [fps]);

  // Resolve (or create) the audio lane for a role, returning its track id.
  const ensureLane = useCallback((role: AudioRole): string => {
    const existing = edl.tracks.find((t) => t.kind === 'audio' && t.role === role);
    if (existing) return existing.id;
    const id = `a-${role}`;
    dispatch({ type: 'TL_ADD_TRACK', track: { id, kind: 'audio', role, clips: [] } });
    return id;
  }, [edl, dispatch]);

  // Place an audio asset on its role lane at the playhead; select it.
  const placeAudio = useCallback((role: AudioRole, a: { srcId: string; srcUrl: string; durationS?: number; spans?: { startMs: number; endMs: number }[] }) => {
    const trackId = ensureLane(role);
    const id = `${role[0]}_${a.srcId}_${Math.random().toString(36).slice(2, 7)}`;
    const clip: AudioClip = {
      kind: 'audio', id, srcId: a.srcId, srcUrl: a.srcUrl,
      from: playheadFrame(), durationInFrames: Math.max(15, Math.round((a.durationS || 3) * fps)), inPoint: 0,
      gainDb: 0, ...(a.spans && a.spans.length ? { spans: a.spans } : {}), ...(role === 'music' ? { duck: false } : {}),
    };
    dispatch({ type: 'TL_ADD_CLIP', trackId, clip });
    setSelectedClipId(id);
  }, [ensureLane, playheadFrame, fps, dispatch]);

  const addVideoClip = useCallback((c: BrandClip) => {
    const vTrack = edl.tracks.find((t) => t.kind === 'video') || edl.tracks[0];
    const clip: VideoClip = {
      kind: 'video', id: `c_${c.id}_${Math.random().toString(36).slice(2, 7)}`, srcId: c.id, srcUrl: c.url,
      from: 0, durationInFrames: Math.max(30, Math.round((c.durationS || 6) * fps)), inPoint: 0, volume: 1,
    };
    dispatch({ type: 'TL_APPEND_CLIP', trackId: vTrack.id, clip });
  }, [edl, fps, dispatch]);

  const addDialogue = (t: AudioTrack) => placeAudio('dialogue', {
    srcId: t.id, srcUrl: t.url, durationS: t.durationS || undefined,
    spans: (t.lineSpans || []).map((s) => ({ startMs: Math.round(s.start * 1000), endMs: Math.round(s.end * 1000) })),
  });
  const addSfx = (s: SfxItem) => placeAudio('sfx', { srcId: s.id, srcUrl: s.url || '', durationS: s.durationS });
  const addBed = (b: MusicBed) => placeAudio('music', { srcId: b.id, srcUrl: b.url, durationS: b.durationS });
  const addJamendo = async (j: JamendoTrack) => {
    setJamBusy(true); setError(null);
    try { const picked = await pickJamendo(j.jamendoId); placeAudio('music', { srcId: picked.id, srcUrl: picked.url, durationS: picked.durationS }); }
    catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setJamBusy(false); }
  };
  const runJamendo = async () => {
    if (!jamQ.trim()) return;
    setJamBusy(true); setError(null);
    try { setJam(await searchJamendo({ query: jamQ.trim(), limit: 12 })); }
    catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setJamBusy(false); }
  };
  // Gated AI generate (SPENDS). Confirmed inline; capability stays gated for the agent (T4).
  const runGen = async (kind: 'sfx' | 'music') => {
    setConfirmGen(null); if (!genText.trim()) return;
    setGenBusy(true); setError(null);
    try {
      if (kind === 'sfx') { const r = await generateSfx({ text: genText.trim() }); placeAudio('sfx', { srcId: r.id, srcUrl: r.url, durationS: 3 }); }
      else { const r = await generateMusic({ prompt: genText.trim(), lengthMs: 12000 }); placeAudio('music', { srcId: r.id, srcUrl: r.url, durationS: r.durationS }); }
      setGenText('');
    } catch (e) { setError((e as Error)?.message ?? String(e)); } finally { setGenBusy(false); }
  };

  const onWidgetChange = useCallback((next: TimelineRow[]) => {
    dispatch({ type: 'SET_TIMELINE', timeline: rowsToEdl(next, state.timeline) });
    return false;
  }, [dispatch, state.timeline]);

  const splitAtCursor = useCallback(() => {
    if (!selected) { setError('Select a clip to split.'); return; }
    const sec = timelineState.current?.getTime?.() ?? 0;
    dispatch({ type: 'TL_SPLIT_CLIP', trackId: selected.track.id, clipId: selected.clip.id, atFrame: Math.round(sec * fps) });
  }, [selected, fps, dispatch]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    dispatch({ type: 'TL_REMOVE_CLIP', trackId: selected.track.id, clipId: selected.clip.id });
    setSelectedClipId(null);
  }, [selected, dispatch]);

  const patchSelected = useCallback((patch: Partial<Clip>) => {
    if (!selected) return;
    dispatch({ type: 'TL_PATCH_CLIP', trackId: selected.track.id, clipId: selected.clip.id, patch });
  }, [selected, dispatch]);

  const toggleMute = (t: Track) => dispatch({ type: 'SET_TIMELINE', timeline: { ...edl, tracks: edl.tracks.map((x) => (x.id === t.id ? { ...x, muted: !x.muted } : x)) } });

  // Vertical reorder: swap a track with its neighbour (order = lane order + video/text visual stacking).
  const moveTrack = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= edl.tracks.length) return;
    const tracks = edl.tracks.slice();
    [tracks[index], tracks[j]] = [tracks[j], tracks[index]];
    dispatch({ type: 'SET_TIMELINE', timeline: { ...edl, tracks } });
  };
  // Add an extra lane beyond the default five (e.g. a 2nd music/SFX lane or a PiP video track).
  const addLane = (kind: Track['kind'], role?: AudioRole) => {
    const id = `${role || kind}-${Math.random().toString(36).slice(2, 6)}`;
    dispatch({ type: 'TL_ADD_TRACK', track: { id, kind, ...(role ? { role } : {}), clips: [] } });
    setAddingLane(false);
  };

  const onExport = useCallback(async () => {
    if (durationInFrames < 2) { setError('Add at least one clip to the timeline first.'); return; }
    setRendering(true); setError(null); setRenderUrl(null); setAdded(false);
    try {
      const res = await enqueueRender({ compositionId: 'Timeline', format, props: { tracks: edl.tracks, fps } });
      if (!res.ok || !res.jobId) throw new Error(res.message || 'Render enqueue failed.');
      let job = await pollRenderJob(res.jobId);
      for (let i = 0; i < 200 && job && job.status !== 'done' && job.status !== 'error'; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        job = await pollRenderJob(res.jobId);
      }
      if (!job || job.status !== 'done' || !job.outputUrl) throw new Error(job?.error || 'Render did not complete.');
      setRenderUrl(job.outputUrl);
      toaster.show('Timeline rendered.', 'success');
    } catch (e) {
      // User-facing message only; keep the raw error in the console for troubleshooting.
      console.error('[VideoEditor] export failed:', e);
      setError('Export failed — the render service couldn\'t finish this timeline. See the browser console for details.');
    }
    finally { setRendering(false); }
  }, [durationInFrames, format, edl, fps, toaster]);

  const addRenderToAd = useCallback(async () => {
    if (!renderUrl || !state.activeAdId) return;
    const id = renderUrl.split('/').pop()?.replace(/\.[^.]+$/, '') || `edit_${Date.now()}`;
    try { await addObject({ adId: state.activeAdId, type: 'clip', id }); setAdded(true); } catch { /* keep resilient */ }
  }, [renderUrl, state.activeAdId]);

  const newTimeline = () => { dispatch({ type: 'SET_TIMELINE', timeline: emptyEDL({ fps }) }); setSelectedClipId(null); setRenderUrl(null); };

  const addText = useCallback(() => {
    const tTrack = edl.tracks.find((t) => t.kind === 'text') || edl.tracks[edl.tracks.length - 1];
    const at = playheadFrame();
    dispatch({ type: 'TL_ADD_CLIP', trackId: tTrack.id, clip: { kind: 'text', id: `tx_${Math.random().toString(36).slice(2, 7)}`, from: at, durationInFrames: 2 * fps, text: 'New text' } });
  }, [edl, fps, dispatch, playheadFrame]);

  const playerStyle = useMemo(() => ({ width: '100%', height: '100%' }), []);
  const secToFrames = (s: number) => Math.max(0, Math.round(s * fps));

  const binTabs: Array<{ k: typeof bin; label: string }> = [
    { k: 'video', label: 'Video' }, { k: 'dialogue', label: 'Dialogue' }, { k: 'sfx', label: 'SFX' }, { k: 'music', label: 'Music' },
  ];
  const rowBtn = 'w-full text-left px-[8px] py-[7px] rounded-[6px] border border-newBorder hover:border-ai bg-newBgColorInner text-[11px] text-btnText flex items-center gap-[6px]';

  return (
    <div className="flex flex-col gap-[12px]">
      {/* Toolbar */}
      <div className={card + ' px-[12px] py-[10px] flex flex-wrap items-center gap-[10px]'}>
        <span className="text-[14px] font-[700] text-btnText">🎬 Video Editor</span>
        <span className="text-[11px] text-textItemBlur">{edl.tracks.reduce((n, t) => n + t.clips.length, 0)} clips · {(durationInFrames / fps).toFixed(1)}s</span>
        <button type="button" onClick={splitAtCursor} className="h-[32px] px-[12px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText hover:bg-boxHover">✂ Split</button>
        <button type="button" onClick={addText} className="h-[32px] px-[12px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText hover:bg-boxHover">+ Text</button>
        <button type="button" onClick={newTimeline} className="h-[32px] px-[12px] rounded-[8px] border border-newBorder text-[12px] text-textItemBlur hover:text-btnText">New</button>
        <span className="ml-auto" />
        <label className="flex items-center gap-[6px] text-[12px] text-textItemBlur">Format
          <select value={format} onChange={(e) => setFormat(e.target.value)} className="h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText">
            {formats ? Object.entries(formats).map(([k, m]) => <option key={k} value={k}>{m.label}</option>) : <option value="reels">Reels 9:16</option>}
          </select>
        </label>
        <button type="button" disabled={rendering} onClick={onExport}
          className="h-[34px] px-[16px] rounded-[8px] bg-ai text-white text-[12px] font-[700] disabled:opacity-50">
          {rendering ? 'Rendering…' : '⬇ Export'}
        </button>
      </div>
      {error && <div className="text-[12px] text-red-400">{error}</div>}

      {/* Top region: Library (left) · Canvas (center) · Inspector (right) */}
      <div className="flex flex-col lg:flex-row gap-[12px]">
        {/* Library / source bin */}
        <div className={card + ' lg:w-[248px] shrink-0 p-[12px] flex flex-col gap-[8px]'}>
          <span className="text-[13px] font-[600] text-btnText">Library</span>
          <div className="flex gap-[4px]">
            {binTabs.map((t) => (
              <button key={t.k} type="button" onClick={() => setBin(t.k)}
                className={'flex-1 h-[26px] rounded-[6px] text-[11px] font-[600] border ' + (bin === t.k ? 'border-ai text-btnText bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText')}>
                {t.label}
              </button>
            ))}
          </div>

          {bin === 'video' && (
            <>
              <span className="text-[10px] text-textItemBlur">Click + to add a clip to the video track.</span>
              <div className="grid grid-cols-2 gap-[8px] overflow-y-auto max-h-[38vh] pr-[2px]">
                {clips.map((c) => (
                  <button key={c.id} type="button" onClick={() => addVideoClip(c)} title="Add to timeline"
                    className="relative aspect-square rounded-[6px] overflow-hidden border border-newBorder hover:border-ai bg-black group">
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                    <video src={c.url} muted preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 text-white text-[22px] font-[800] opacity-0 group-hover:opacity-100">＋</span>
                  </button>
                ))}
                {clips.length === 0 && <span className="col-span-2 text-[11px] text-textItemBlur py-[10px]">No clips yet. Generate some on the Video tab.</span>}
              </div>
            </>
          )}

          {bin === 'dialogue' && (
            <>
              <span className="text-[10px] text-textItemBlur">Rendered voice-overs. Adds to the Dialogue lane at the playhead (drives the music duck).</span>
              <div className="flex flex-col gap-[6px] overflow-y-auto max-h-[38vh] pr-[2px]">
                {audioTracks.map((t) => (
                  <button key={t.id} type="button" onClick={() => addDialogue(t)} className={rowBtn} title="Add to Dialogue lane">
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: LANE_COLOR.dialogue, flexShrink: 0 }} />
                    <span className="truncate flex-1">{t.scriptName || t.text || t.id}</span>
                    <span className="text-textItemBlur tabular-nums">{t.durationS ? `${t.durationS.toFixed(1)}s` : ''}</span>
                  </button>
                ))}
                {audioTracks.length === 0 && <span className="text-[11px] text-textItemBlur py-[10px]">No voice-overs yet. Render one on the Audio tab.</span>}
              </div>
            </>
          )}

          {bin === 'sfx' && (
            <>
              <span className="text-[10px] text-textItemBlur">One-shots for the SFX lane. Place at the playhead, then nudge to a cut.</span>
              <div className="flex flex-col gap-[6px] overflow-y-auto max-h-[30vh] pr-[2px]">
                {sfx.map((s) => (
                  <button key={s.id} type="button" onClick={() => addSfx(s)} className={rowBtn} title="Add to SFX lane">
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: LANE_COLOR.sfx, flexShrink: 0 }} />
                    <span className="truncate flex-1">{s.label}</span>
                    <span className="text-textItemBlur tabular-nums">{s.durationS ? `${s.durationS.toFixed(1)}s` : ''}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-[5px] border-t border-newBorder pt-[8px]">
                <span className="text-[10px] font-[600] text-textItemBlur uppercase">Generate SFX (AI)</span>
                <input value={bin === 'sfx' ? genText : ''} onChange={(e) => setGenText(e.target.value)} placeholder="e.g. glass shatter, whoosh"
                  className="h-[30px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[11px] text-btnText" />
                <button type="button" disabled={genBusy || !genText.trim()} onClick={() => setConfirmGen('sfx')}
                  className="h-[30px] rounded-[6px] bg-ai text-white text-[11px] font-[700] disabled:opacity-50">{genBusy ? 'Generating…' : '⚡ Generate SFX (~200 cr)'}</button>
              </div>
            </>
          )}

          {bin === 'music' && (
            <>
              <span className="text-[10px] text-textItemBlur">Beds for the Music lane. Toggle Duck in the inspector to dip under speech.</span>
              <div className="flex flex-col gap-[6px] overflow-y-auto max-h-[22vh] pr-[2px]">
                {beds.map((b) => (
                  <button key={b.id} type="button" onClick={() => addBed(b)} className={rowBtn} title="Add local bed to Music lane">
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: LANE_COLOR.music, flexShrink: 0 }} />
                    <span className="truncate flex-1">{b.mood} · {b.bpm} bpm</span>
                    <span className="text-textItemBlur tabular-nums">{b.durationS}s</span>
                  </button>
                ))}
              </div>
              {/* Jamendo search */}
              <div className="flex flex-col gap-[5px] border-t border-newBorder pt-[8px]">
                <span className="text-[10px] font-[600] text-textItemBlur uppercase">Jamendo catalog</span>
                <div className="flex gap-[5px]">
                  <input value={jamQ} onChange={(e) => setJamQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runJamendo()} placeholder="search music"
                    className="h-[30px] flex-1 px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[11px] text-btnText" />
                  <button type="button" disabled={jamBusy || !jamQ.trim()} onClick={runJamendo} className="h-[30px] px-[10px] rounded-[6px] border border-newBorder text-[11px] text-btnText disabled:opacity-50">Go</button>
                </div>
                {jam && !jam.configured && <span className="text-[10px] text-amber-400">{jam.note || 'Add JAMENDO_CLIENT_ID to search Jamendo.'}</span>}
                <div className="flex flex-col gap-[5px] overflow-y-auto max-h-[16vh]">
                  {(jam?.tracks || []).map((j) => (
                    <button key={j.jamendoId} type="button" disabled={jamBusy} onClick={() => addJamendo(j)} className={rowBtn} title={j.commercialUse ? 'Add to Music lane' : 'CC track — not ad-cleared; license separately for paid ads'}>
                      <span className="truncate flex-1">{j.name} · {j.artist}</span>
                      {!j.commercialUse && <span className="text-[9px] text-amber-400">CC</span>}
                      <span className="text-textItemBlur tabular-nums">{j.durationS}s</span>
                    </button>
                  ))}
                </div>
              </div>
              {/* AI music */}
              <div className="flex flex-col gap-[5px] border-t border-newBorder pt-[8px]">
                <span className="text-[10px] font-[600] text-textItemBlur uppercase">Generate music (AI)</span>
                <input value={bin === 'music' ? genText : ''} onChange={(e) => setGenText(e.target.value)} placeholder="e.g. calm lofi, 12s"
                  className="h-[30px] px-[8px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[11px] text-btnText" />
                <button type="button" disabled={genBusy || !genText.trim()} onClick={() => setConfirmGen('music')}
                  className="h-[30px] rounded-[6px] bg-ai text-white text-[11px] font-[700] disabled:opacity-50">{genBusy ? 'Generating…' : '⚡ Generate music (~180 cr)'}</button>
              </div>
            </>
          )}

          {confirmGen && (
            <div className="flex flex-col gap-[6px] rounded-[8px] border border-ai/40 bg-ai/10 p-[8px] text-[11px] text-btnText">
              <span>This spends ElevenLabs credits ({confirmGen === 'sfx' ? '~200' : '~180'} cr). Continue?</span>
              <div className="flex gap-[6px]">
                <button type="button" onClick={() => runGen(confirmGen)} className="h-[28px] px-[10px] rounded-[6px] bg-ai text-white font-[700]">Generate</button>
                <button type="button" onClick={() => setConfirmGen(null)} className="h-[28px] px-[10px] rounded-[6px] border border-newBorder text-textItemBlur">Cancel</button>
              </div>
            </div>
          )}
        </div>

        {/* Canvas — @remotion/player of the composed edit */}
        <div className={card + ' flex-1 min-w-0 p-[10px] flex items-center justify-center bg-black'}>
          <div className="w-full max-h-[46vh] aspect-[9/16] max-w-[280px] mx-auto">
            <Player
              ref={playerRef}
              component={TimelineComposition as never}
              inputProps={{ tracks: edl.tracks, fps } as never}
              durationInFrames={durationInFrames}
              fps={fps}
              compositionWidth={edl.width}
              compositionHeight={edl.height}
              style={playerStyle}
              controls
              acknowledgeRemotionLicense
            />
          </div>
        </div>

        {/* Inspector — on clip select */}
        <div className={card + ' lg:w-[250px] shrink-0 p-[12px] flex flex-col gap-[10px]'}>
          <span className="text-[13px] font-[600] text-btnText">Inspector</span>
          {!selected ? (
            <span className="text-[11px] text-textItemBlur">Select a clip in the timeline to edit it.</span>
          ) : (
            <>
              <span className="text-[11px] text-textItemBlur truncate">{selected.clip.kind === 'audio' ? laneLabelOf(selected.track) : selected.clip.kind} · {selected.clip.id}</span>
              {selected.clip.kind === 'text' && (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Text</span>
                  <input value={(selected.clip as { text?: string }).text ?? ''} onChange={(e) => patchSelected({ text: e.target.value } as Partial<Clip>)}
                    className="h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText" /></label>
              )}
              {selected.clip.kind === 'video' && (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Volume {Math.round(((selected.clip as VideoClip).volume ?? 1) * 100)}%</span>
                  <input type="range" min={0} max={1} step={0.05} value={(selected.clip as VideoClip).volume ?? 1} onChange={(e) => patchSelected({ volume: Number(e.target.value) } as Partial<Clip>)} /></label>
              )}
              {selected.clip.kind === 'audio' && (() => {
                const ac = selected.clip as AudioClip;
                const gain = ac.gainDb ?? 0;
                return (
                  <>
                    <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Gain {gain > 0 ? '+' : ''}{gain} dB</span>
                      <input type="range" min={-24} max={6} step={1} value={gain} onChange={(e) => patchSelected({ gainDb: Number(e.target.value) } as Partial<Clip>)} /></label>
                    <div className="flex gap-[8px]">
                      <label className="flex flex-col gap-[3px] flex-1"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Fade in (s)</span>
                        <input type="number" min={0} step={0.1} value={((ac.fadeInFrames ?? 0) / fps).toFixed(1)} onChange={(e) => patchSelected({ fadeInFrames: secToFrames(Number(e.target.value)) } as Partial<Clip>)}
                          className="h-[30px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText" /></label>
                      <label className="flex flex-col gap-[3px] flex-1"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Fade out (s)</span>
                        <input type="number" min={0} step={0.1} value={((ac.fadeOutFrames ?? 0) / fps).toFixed(1)} onChange={(e) => patchSelected({ fadeOutFrames: secToFrames(Number(e.target.value)) } as Partial<Clip>)}
                          className="h-[30px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText" /></label>
                    </div>
                    {selected.track.role === 'music' && (
                      <label className="flex items-center gap-[8px] text-[11px] font-[600] text-btnText">
                        <input type="checkbox" checked={!!ac.duck} onChange={(e) => patchSelected({ duck: e.target.checked } as Partial<Clip>)} />
                        Duck under dialogue
                      </label>
                    )}
                  </>
                );
              })()}
              {(selected.clip.kind === 'video' || selected.clip.kind === 'text') && (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Transition out</span>
                  <select value={selected.clip.transitionOut?.type ?? 'cut'} onChange={(e) => patchSelected({ transitionOut: e.target.value === 'cut' ? undefined : { type: e.target.value, durationInFrames: Math.round(0.4 * fps) } } as Partial<Clip>)}
                    className="h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText">
                    {TRANSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></label>
              )}
              <button type="button" onClick={removeSelected} className="h-[32px] rounded-[8px] border border-[#ff7eb6]/40 text-[#ff7eb6] text-[12px] font-[600] hover:bg-[#ff7eb6]/10">Remove clip</button>
            </>
          )}
          {renderUrl && (
            <div className="flex flex-col gap-[6px] border-t border-newBorder pt-[8px]">
              <span className="text-[11px] font-[600] text-green-400">Rendered ✓</span>
              <a href={renderUrl} download className="h-[30px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-btnText flex items-center justify-center hover:bg-boxHover">↓ Download</a>
              <button type="button" disabled={!state.activeAdId || added} onClick={addRenderToAd} className="h-[30px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">{added ? 'Added ✓' : '+ Add to ad'}</button>
            </div>
          )}
        </div>
      </div>

      {/* Timeline — lane labels + multi-track lanes on one ruler */}
      <div className={card + ' p-[8px] overflow-hidden flex'}>
        {/* Lane labels + controls (aligned to the widget's rows; top spacer clears its time ruler) */}
        <div className="shrink-0 w-[112px] pr-[6px]" style={{ paddingTop: RULER_H }}>
          {edl.tracks.map((t, i) => (
            <div key={t.id} style={{ height: ROW_H }} className="flex items-center gap-[3px] text-[10px] font-[600]">
              <span style={{ width: 6, height: 6, borderRadius: 6, background: laneColorOf(t), flexShrink: 0 }} />
              <span className="text-btnText truncate flex-1">{laneLabelOf(t)}</span>
              <span className="flex flex-col leading-[7px]">
                <button type="button" onClick={() => moveTrack(i, -1)} disabled={i === 0} title="Move up"
                  className="text-[8px] text-textItemBlur hover:text-btnText disabled:opacity-25">▲</button>
                <button type="button" onClick={() => moveTrack(i, 1)} disabled={i === edl.tracks.length - 1} title="Move down"
                  className="text-[8px] text-textItemBlur hover:text-btnText disabled:opacity-25">▼</button>
              </span>
              {t.kind === 'audio' && (
                <button type="button" onClick={() => toggleMute(t)} title={t.muted ? 'Unmute' : 'Mute'}
                  className={'text-[9px] leading-none px-[2px] rounded-[3px] ' + (t.muted ? 'text-red-400' : 'text-textItemBlur hover:text-btnText')}>{t.muted ? '🔇' : '🔊'}</button>
              )}
            </div>
          ))}
          {/* Add an extra lane beyond the default five */}
          <div className="relative mt-[4px]">
            <button type="button" onClick={() => setAddingLane((v) => !v)} title="Add a track"
              className="h-[20px] w-full rounded-[5px] border border-dashed border-newBorder text-[11px] text-textItemBlur hover:text-btnText hover:border-ai">＋ Track</button>
            {addingLane && (
              <div className="absolute z-10 left-0 top-[24px] w-[128px] rounded-[6px] border border-newBorder bg-newBgColorInner p-[4px] flex flex-col gap-[2px] shadow-lg">
                {([['video', undefined, 'Video'], ['audio', 'dialogue', 'Dialogue'], ['audio', 'sfx', 'SFX'], ['audio', 'music', 'Music'], ['text', undefined, 'Text']] as Array<[Track['kind'], AudioRole | undefined, string]>).map(([k, r, lbl]) => (
                  <button key={lbl} type="button" onClick={() => addLane(k, r)}
                    className="text-left px-[6px] py-[4px] rounded-[4px] text-[11px] text-btnText hover:bg-ai/10 flex items-center gap-[6px]">
                    <span style={{ width: 6, height: 6, borderRadius: 6, background: LANE_COLOR[r || k] }} />{lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0" style={{ height: timelineHeight }}>
          <TimelineWidget
            ref={timelineState}
            editorData={rows}
            effects={EFFECTS}
            autoScroll
            gridSnap
            dragLine
            rowHeight={ROW_H}
            style={{ height: timelineHeight, width: '100%' }}
            scale={1}
            scaleWidth={80}
            startLeft={20}
            onChange={onWidgetChange}
            onClickAction={(_e, { action }: { action: TimelineAction }) => setSelectedClipId(action.id)}
            getActionRender={(action: TimelineAction, row: TimelineRow) => {
              const isSel = action.id === selectedClipId;
              const track = edl.tracks.find((t) => t.id === row.id);
              const clip = track?.clips.find((c) => c.id === action.id);
              const color = laneColorOf(track);
              const isAudio = clip?.kind === 'audio';
              const wave = isAudio ? peaks[(clip as AudioClip).srcId] : undefined;
              const label = clip ? (clip.kind === 'text' ? `T: ${(clip as { text?: string }).text ?? ''}` : isAudio ? '' : clip.kind) : row.id;
              return (
                <div style={{ position: 'relative', height: '100%', borderRadius: 6, background: isAudio ? `${color}26` : color, opacity: isSel ? 1 : 0.9, border: isSel ? '2px solid #fff' : `1px solid ${isAudio ? color : 'rgba(0,0,0,0.3)'}`, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {isAudio && wave && wave.length > 0 && <WaveBars peaks={wave} color={color} />}
                  {isAudio && (clip as AudioClip).duck && <span style={{ position: 'absolute', top: 1, right: 3, fontSize: 8 }}>duck</span>}
                  <span style={{ position: 'relative' }}>{label}</span>
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default StudioVideoEditorNLE;
