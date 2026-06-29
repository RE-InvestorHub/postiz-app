'use client';

// Video Editor — the multi-track NLE (Plan 3). Layout (user-approved): a source-bin LIBRARY (left)
// + a @remotion/player CANVAS of the composed edit (center) + an INSPECTOR (right, on clip-select),
// over a full-width multi-track TIMELINE (bottom, @xzdarcy/react-timeline-editor). The edit is the
// store's `timeline` EDL — the single, serializable, agent-drivable document. Postiz tokens only.

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Player, PlayerRef } from '@remotion/player';
import { Timeline as TimelineWidget, TimelineState, TimelineRow, TimelineAction } from '@xzdarcy/react-timeline-editor';
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { Timeline as TimelineComposition } from '@gitroom/frontend/components/studio/timeline/timeline.composition';
import { edlDuration, emptyEDL, TimelineEDL, Clip, VideoClip } from '@gitroom/frontend/components/studio/timeline/timeline.contract';
import { trackOfClip } from '@gitroom/frontend/components/studio/timeline/timeline.reducer';
import { listVideoLibrary, BrandClip } from '@gitroom/frontend/components/studio/studio.video-client';
import { enqueueRender, pollRenderJob, fetchFormats, FormatMeta } from '@gitroom/frontend/components/studio/studio.remotion-client';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';

const EFFECTS = { default: { id: 'default', name: 'clip' } };
const TRANSITIONS = ['cut', 'fade', 'dissolve', 'slide', 'wipe', 'zoomBlur', 'iris', 'cube'];

// EDL → widget rows (frames → seconds). The widget edits start/end in seconds.
function edlToRows(edl: TimelineEDL): TimelineRow[] {
  const fps = edl.fps || 30;
  return edl.tracks.map((t) => ({
    id: t.id,
    actions: t.clips.map((c) => ({
      id: c.id,
      start: c.from / fps,
      end: (c.from + c.durationInFrames) / fps,
      effectId: 'default',
    })),
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

  const playerRef = useRef<PlayerRef>(null);
  const timelineState = useRef<TimelineState>(null);

  // Load the brand's clips (source bin) + the export formats.
  useEffect(() => { listVideoLibrary(brandKitId).then((l) => setClips(l.clips)).catch(() => {}); }, [brandKitId]);
  useEffect(() => { fetchFormats().then((f) => f && setFormats(f)).catch(() => {}); }, []);
  // Pick up clips the Director/gap-fill generated while the editor is open.
  useEffect(() => {
    const onRefresh = () => listVideoLibrary(brandKitId).then((l) => setClips(l.clips)).catch(() => {});
    if (typeof window !== 'undefined') window.addEventListener('reinvestorhub:video-refresh', onRefresh);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('reinvestorhub:video-refresh', onRefresh); };
  }, [brandKitId]);

  const durationInFrames = Math.max(1, edlDuration(edl));
  const rows = useMemo(() => edlToRows(edl), [edl]);

  const selected = useMemo(() => {
    for (const t of edl.tracks) { const c = t.clips.find((x) => x.id === selectedClipId); if (c) return { clip: c, trackId: t.id }; }
    return null;
  }, [edl, selectedClipId]);

  // Add a library clip to the video track (V1) — the reducer appends it at the track end (robust to
  // rapid clicks, since `from` is computed from fresh state, not the render closure).
  const addClipToTimeline = useCallback((c: BrandClip) => {
    const vTrack = edl.tracks.find((t) => t.kind === 'video') || edl.tracks[0];
    const clip: VideoClip = {
      kind: 'video', id: `c_${c.id}_${Math.random().toString(36).slice(2, 7)}`, srcId: c.id, srcUrl: c.url,
      from: 0, durationInFrames: Math.max(30, Math.round((c.durationS || 6) * fps)), inPoint: 0, volume: 1,
    };
    dispatch({ type: 'TL_APPEND_CLIP', trackId: vTrack.id, clip });
  }, [edl, fps, dispatch]);

  const onWidgetChange = useCallback((next: TimelineRow[]) => {
    dispatch({ type: 'SET_TIMELINE', timeline: rowsToEdl(next, state.timeline) });
    return false; // we own the data; don't let the widget keep an internal copy
  }, [dispatch, state.timeline]);

  const splitAtCursor = useCallback(() => {
    if (!selected) { setError('Select a clip to split.'); return; }
    const sec = timelineState.current?.getTime?.() ?? 0;
    dispatch({ type: 'TL_SPLIT_CLIP', trackId: selected.trackId, clipId: selected.clip.id, atFrame: Math.round(sec * fps) });
  }, [selected, fps, dispatch]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    dispatch({ type: 'TL_REMOVE_CLIP', trackId: selected.trackId, clipId: selected.clip.id });
    setSelectedClipId(null);
  }, [selected, dispatch]);

  const patchSelected = useCallback((patch: Partial<Clip>) => {
    if (!selected) return;
    dispatch({ type: 'TL_PATCH_CLIP', trackId: selected.trackId, clipId: selected.clip.id, patch });
  }, [selected, dispatch]);

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
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setRendering(false); }
  }, [durationInFrames, format, edl, fps, toaster]);

  const addRenderToAd = useCallback(async () => {
    if (!renderUrl || !state.activeAdId) return;
    const id = renderUrl.split('/').pop()?.replace(/\.[^.]+$/, '') || `edit_${Date.now()}`;
    try { await addObject({ adId: state.activeAdId, type: 'clip', id }); setAdded(true); } catch { /* keep resilient */ }
  }, [renderUrl, state.activeAdId]);

  const newTimeline = () => { dispatch({ type: 'SET_TIMELINE', timeline: emptyEDL({ fps }) }); setSelectedClipId(null); setRenderUrl(null); };

  // Append a text overlay to the text track at the playhead (default 2s).
  const addText = useCallback(() => {
    const tTrack = edl.tracks.find((t) => t.kind === 'text') || edl.tracks[edl.tracks.length - 1];
    const at = Math.round((timelineState.current?.getTime?.() ?? 0) * fps);
    dispatch({ type: 'TL_ADD_CLIP', trackId: tTrack.id, clip: { kind: 'text', id: `tx_${Math.random().toString(36).slice(2, 7)}`, from: at, durationInFrames: 2 * fps, text: 'New text' } });
  }, [edl, fps, dispatch]);

  // Player scale — fit the composition into the canvas box.
  const playerStyle = useMemo(() => ({ width: '100%', height: '100%' }), []);

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
        <div className={card + ' lg:w-[230px] shrink-0 p-[12px] flex flex-col gap-[8px]'}>
          <span className="text-[13px] font-[600] text-btnText">Library</span>
          <span className="text-[10px] text-textItemBlur">Click + to add a clip to the timeline.</span>
          <div className="grid grid-cols-2 gap-[8px] overflow-y-auto max-h-[38vh] pr-[2px]">
            {clips.map((c) => (
              <button key={c.id} type="button" onClick={() => addClipToTimeline(c)} title="Add to timeline"
                className="relative aspect-square rounded-[6px] overflow-hidden border border-newBorder hover:border-ai bg-black group">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={c.url} muted preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 text-white text-[22px] font-[800] opacity-0 group-hover:opacity-100">＋</span>
              </button>
            ))}
            {clips.length === 0 && <span className="col-span-2 text-[11px] text-textItemBlur py-[10px]">No clips yet. Generate some on the Video tab.</span>}
          </div>
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
              <span className="text-[11px] text-textItemBlur truncate">{selected.clip.kind} · {selected.clip.id}</span>
              {selected.clip.kind === 'text' && (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Text</span>
                  <input value={(selected.clip as { text?: string }).text ?? ''} onChange={(e) => patchSelected({ text: e.target.value } as Partial<Clip>)}
                    className="h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText" /></label>
              )}
              {(selected.clip.kind === 'video' || selected.clip.kind === 'audio') && (
                <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Volume {Math.round(((selected.clip as VideoClip).volume ?? 1) * 100)}%</span>
                  <input type="range" min={0} max={1} step={0.05} value={(selected.clip as VideoClip).volume ?? 1} onChange={(e) => patchSelected({ volume: Number(e.target.value) } as Partial<Clip>)} /></label>
              )}
              <label className="flex flex-col gap-[3px]"><span className="text-[10px] font-[600] text-textItemBlur uppercase">Transition out</span>
                <select value={selected.clip.transitionOut?.type ?? 'cut'} onChange={(e) => patchSelected({ transitionOut: e.target.value === 'cut' ? undefined : { type: e.target.value, durationInFrames: Math.round(0.4 * fps) } } as Partial<Clip>)}
                  className="h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText">
                  {TRANSITIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></label>
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

      {/* Timeline — multi-track lanes */}
      <div className={card + ' p-[8px] overflow-hidden'}>
        <TimelineWidget
          ref={timelineState}
          editorData={rows}
          effects={EFFECTS}
          autoScroll
          gridSnap
          dragLine
          rowHeight={40}
          scale={1}
          scaleWidth={80}
          startLeft={20}
          onChange={onWidgetChange}
          onClickAction={(_e, { action }: { action: TimelineAction }) => setSelectedClipId(action.id)}
          getActionRender={(action: TimelineAction, row: TimelineRow) => {
            const isSel = action.id === selectedClipId;
            const track = edl.tracks.find((t) => t.id === row.id);
            const clip = track?.clips.find((c) => c.id === action.id);
            const label = clip ? (clip.kind === 'text' ? `T: ${(clip as { text?: string }).text ?? ''}` : clip.kind) : row.id;
            const color = track?.kind === 'audio' ? '#612bd3' : track?.kind === 'text' || track?.kind === 'captions' ? '#0ea5a4' : '#d82d7e';
            return (
              <div style={{ height: '100%', borderRadius: 6, background: color, opacity: isSel ? 1 : 0.82, border: isSel ? '2px solid #fff' : '1px solid rgba(0,0,0,0.3)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {label}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
};

export default StudioVideoEditorNLE;
