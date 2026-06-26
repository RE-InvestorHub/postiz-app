'use client';

// Video composer — Generate → Project → COMPOSE for a short video (full-brief path).
// Fill a compact brief (pre-filled from the active Ad), Plan & estimate (free), then
// Compose video (spends credits): the brain expands the brief → storyboard, the pipeline
// generates per-shot clips, you review each (Accept / Reject-with-feedback → regenerate),
// then Assemble the short and Add it back to the Ad. Mirrors the Still composer's shape.
// Magenta bg-ai = spenders (Compose / Assemble); purple bg-btnPrimary = curation (Accept /
// Add to ad). Postiz tokens. Backend: /compose/video/* + the reused /pipeline/* engine.

import { FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, addObject, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';
import { assetUrl } from '@gitroom/frontend/components/studio/studio.composer-client';
import {
  estimateVideo, planVideo, startRun, pollRun, acceptShot, regenShot, assembleRun, clipUrl,
  CostEstimate, PipelineRun, PipelineShot,
} from '@gitroom/frontend/components/studio/studio.pipeline-client';

const Spinner: FC<{ size?: number }> = ({ size = 18 }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

const inputCls =
  'h-[40px] px-[10px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur';

const VIDEO_MODELS = ['veo3_1', 'veo3_1_lite', 'kling3_0', 'seedance_2_0'];
const STATUS_TINT: Record<string, string> = {
  pending: 'text-textItemBlur', generating: 'text-ai', awaiting_review: 'text-yellow-400',
  accepted: 'text-green-400', regenerating: 'text-ai', error: 'text-red-400',
};

export const StudioVideoComposerPanel: FC = () => {
  const { state } = useStudio();

  // Brief form (pre-filled; only core_message is strictly required)
  const [coreMessage, setCoreMessage] = useState('');
  const [cta, setCta] = useState('');
  const [visualStyle, setVisualStyle] = useState('cinematic, modern, clean');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [durationS, setDurationS] = useState(6);
  const [model, setModel] = useState('veo3_1');
  const [characterRef, setCharacterRef] = useState<string>('');   // optional Ad image id

  const [images, setImages] = useState<ResolvedObject[]>([]);
  const [plan, setPlan] = useState<{ storyboard: any; shotCount: number } | null>(null);
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [feedbacks, setFeedbacks] = useState<Record<string, string>>({});
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState<string | null>(null);   // 'plan'|'compose'|'assemble'|null
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the Ad's images (for the optional character-reference picker).
  useEffect(() => {
    if (!state.activeAdId) { setImages([]); return; }
    getAdObjects(state.activeAdId).then((objs) => setImages(objs.filter((o) => o.type === 'image'))).catch(() => {});
  }, [state.activeAdId]);

  // Poll the run while it's active.
  useEffect(() => {
    if (!run?.runId) return;
    const terminal = run.status === 'done' || run.status === 'error';
    if (terminal) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    if (pollRef.current) return;   // already polling
    pollRef.current = setInterval(async () => {
      try { setRun(await pollRun(run.runId)); } catch { /* transient */ }
    }, 4000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [run?.runId, run?.status]);

  const charRefUrl = useMemo(() => {
    const rec = images.find((o) => o.id === characterRef)?.record;
    return rec ? (rec.cdnUrl || (rec.path ? assetUrl(rec.path) : '')) : '';
  }, [characterRef, images]);

  const briefPayload = useCallback(() => ({
    adId: state.activeAdId ?? undefined,
    core_message: coreMessage.trim(),
    cta: cta.trim() || undefined,
    visual_style: visualStyle.trim() || undefined,
    aspect_ratio: aspectRatio,
    ...(charRefUrl ? { character_reference: charRefUrl } : {}),
  }), [state.activeAdId, coreMessage, cta, visualStyle, aspectRatio, charRefUrl]);

  const doPlan = useCallback(async () => {
    if (!coreMessage.trim()) return;
    setBusy('plan'); setError(null); setPlan(null); setEstimate(null); setRun(null);
    try {
      const p = await planVideo(briefPayload());
      const shotCount = p.storyboard?.shots?.length ?? 0;
      setPlan({ storyboard: p.storyboard, shotCount });
      try { setEstimate(await estimateVideo({ model, shots: shotCount, durationS })); }
      catch (e) { setError(`Estimate unavailable: ${(e as Error)?.message ?? e}`); }
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [coreMessage, briefPayload, model, durationS]);

  const doCompose = useCallback(async () => {
    if (!plan?.storyboard) return;
    setBusy('compose'); setError(null);
    try {
      const started = await startRun({ storyboard: plan.storyboard });
      setRun(await pollRun(started.runId));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [plan]);

  const doAccept = useCallback(async (shotId: string) => {
    if (!run?.runId) return;
    try { setRun(await acceptShot({ runId: run.runId, shotId })); } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [run?.runId]);

  const doRegen = useCallback(async (shotId: string) => {
    if (!run?.runId) return;
    try { setRun(await regenShot({ runId: run.runId, shotId, feedback: feedbacks[shotId] || '' })); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [run?.runId, feedbacks]);

  const doAssemble = useCallback(async () => {
    if (!run?.runId) return;
    setBusy('assemble'); setError(null);
    try { setRun(await assembleRun({ runId: run.runId })); } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [run?.runId]);

  const addClip = useCallback(async (id: string) => {
    if (!state.activeAdId || !id) return;
    try { await addObject({ adId: state.activeAdId, type: 'clip', id }); setAddedIds((s) => new Set(s).add(id)); }
    catch { /* keep resilient */ }
  }, [state.activeAdId]);

  const shots = run?.shots ?? [];
  const allAccepted = shots.length > 0 && shots.every((s) => s.status === 'accepted');
  const renders = run?.renders ?? [];

  if (!state.activeCampaignId || !state.activeAdId) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">
        Select a <span className="text-btnText font-[600]">Campaign</span> and an{' '}
        <span className="text-btnText font-[600]">Ad</span> in the Project bar above. The Video composer
        builds a short from a brief seeded by that Ad’s brand + assets.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Brief */}
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px]">
          <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center font-[700]">▶</span>
          <span className="text-[14px] font-[600] text-btnText">Compose a short video</span>
        </div>

        <textarea value={coreMessage} onChange={(e) => setCoreMessage(e.target.value)} rows={2}
          placeholder="Core message / treatment (e.g. Premium brake service, booked in 60 seconds)"
          className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y" />

        <div className="flex flex-wrap gap-[8px]">
          <input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="CTA (optional)" className={`${inputCls} flex-1 min-w-[160px]`} />
          <input value={visualStyle} onChange={(e) => setVisualStyle(e.target.value)} placeholder="Visual style" className={`${inputCls} flex-1 min-w-[160px]`} />
        </div>

        <div className="flex flex-wrap gap-[10px] items-end">
          <label className="flex flex-col gap-[4px]"><span className="text-[11px] font-[600] text-textItemBlur uppercase">Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className={inputCls}>
              {VIDEO_MODELS.map((m) => (<option key={m} value={m}>{m}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-[4px]"><span className="text-[11px] font-[600] text-textItemBlur uppercase">Aspect</span>
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className={inputCls}>
              {['9:16', '16:9', '1:1'].map((a) => (<option key={a} value={a}>{a}</option>))}
            </select>
          </label>
          <label className="flex flex-col gap-[4px]"><span className="text-[11px] font-[600] text-textItemBlur uppercase">Shot secs</span>
            <select value={durationS} onChange={(e) => setDurationS(Number(e.target.value))} className={inputCls}>
              {[4, 6, 8].map((d) => (<option key={d} value={d}>{d}s</option>))}
            </select>
          </label>
          {images.length > 0 && (
            <label className="flex flex-col gap-[4px]"><span className="text-[11px] font-[600] text-textItemBlur uppercase">Character ref (optional)</span>
              <select value={characterRef} onChange={(e) => setCharacterRef(e.target.value)} className={inputCls}>
                <option value="">none</option>
                {images.map((o) => (<option key={o.id} value={o.id}>{o.id}</option>))}
              </select>
            </label>
          )}
          <button type="button" disabled={!coreMessage.trim() || busy === 'plan'} onClick={doPlan}
            className="h-[40px] px-[16px] rounded-[8px] border border-newBorder text-btnText font-[600] disabled:opacity-50 ml-auto flex items-center gap-[6px]">
            {busy === 'plan' ? <><Spinner size={14} /> Planning…</> : 'Plan & estimate'}
          </button>
        </div>

        {error && <div className="text-[12px] text-red-400">{error}</div>}
      </div>

      {/* Plan + estimate → Compose */}
      {plan && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px] flex flex-wrap items-center gap-[12px]">
          <span className="text-[13px] text-btnText"><span className="font-[600]">{plan.shotCount}</span> shots</span>
          {estimate && <span className="text-[13px] text-textItemBlur">≈ <span className="text-btnText font-[600]">{estimate.total}</span> credits ({estimate.perShotCredits}/shot · {estimate.model})</span>}
          <button type="button" disabled={busy === 'compose' || !!run} onClick={doCompose}
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 ml-auto flex items-center gap-[8px]">
            {busy === 'compose' ? <><Spinner /> Starting…</> : `Compose video (spends ~${estimate?.total ?? '?'} cr)`}
          </button>
        </div>
      )}

      {/* Per-shot review */}
      {run && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
          <div className="flex items-center gap-[10px]">
            <span className="text-[14px] font-[600] text-btnText">Shots</span>
            <span className="text-[12px] text-textItemBlur">run {run.status}</span>
            {run.status !== 'done' && run.status !== 'error' && <Spinner size={14} />}
          </div>

          <div className="grid grid-cols-1 minCustom:grid-cols-2 gap-[12px]">
            {shots.map((s: PipelineShot) => {
              const url = clipUrl(s.clipUrl);
              return (
                <div key={s.shotId} className="rounded-[8px] border border-newBorder bg-newBgColorInner flex flex-col overflow-hidden">
                  <div className="flex items-center gap-[8px] px-[10px] py-[6px]">
                    <span className="text-[12px] font-[600] text-btnText">Shot {s.shotNumber ?? ''} {s.beat ? `· ${s.beat}` : ''}</span>
                    <span className={`text-[11px] ml-auto ${STATUS_TINT[s.status] || 'text-textItemBlur'}`}>{s.status}</span>
                  </div>
                  {url
                    ? <video src={url} controls muted className="w-full aspect-video object-cover bg-black" />
                    : <div className="w-full aspect-video flex items-center justify-center text-[12px] text-textItemBlur bg-newBgColor">{s.status === 'generating' ? 'cooking…' : '—'}</div>}
                  {s.status === 'awaiting_review' && (
                    <div className="p-[8px] flex flex-col gap-[6px]">
                      <input value={feedbacks[s.shotId] || ''} onChange={(e) => setFeedbacks((f) => ({ ...f, [s.shotId]: e.target.value }))}
                        placeholder="Reject note (what to change)…" className={`${inputCls} w-full`} />
                      <div className="flex gap-[6px]">
                        <button type="button" onClick={() => doRegen(s.shotId)} className="flex-1 h-[32px] rounded-[8px] border border-newBorder text-[12px] font-[600] text-[#ff7eb6]">Reject + regen</button>
                        <button type="button" onClick={() => doAccept(s.shotId)} className="flex-1 h-[32px] rounded-[8px] bg-btnPrimary text-white text-[12px] font-[600]">Accept</button>
                      </div>
                    </div>
                  )}
                  {s.error && <div className="px-[10px] py-[6px] text-[11px] text-red-400">{s.error}</div>}
                </div>
              );
            })}
          </div>

          <button type="button" disabled={!allAccepted || busy === 'assemble' || run.status === 'assembling'} onClick={doAssemble}
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 self-end flex items-center gap-[8px]"
            title={allAccepted ? '' : 'Accept every shot first'}>
            {busy === 'assemble' || run.status === 'assembling' ? <><Spinner /> Assembling…</> : 'Assemble short'}
          </button>
        </div>
      )}

      {/* Assembled renders */}
      {renders.length > 0 && (
        <div className="grid grid-cols-1 minCustom:grid-cols-2 gap-[12px]">
          {renders.map((r, i) => {
            const url = clipUrl(r.url || r.localPath);
            const id = (r.url || r.localPath || '').split('/').pop()?.replace(/\.[^.]+$/, '') || `render_${i}`;
            return (
              <div key={i} className="rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner flex flex-col">
                {url && <video src={url} controls className="w-full aspect-video bg-black" />}
                <div className="px-[8px] py-[6px] text-[11px] text-textItemBlur">{r.format}</div>
                <div className="flex">
                  {url && <a href={url} download className="flex-1 h-[30px] flex items-center justify-center text-[12px] font-[600] text-btnText border-t border-newBorder">Download</a>}
                  <button type="button" disabled={addedIds.has(id)} onClick={() => addClip(id)}
                    className="flex-1 h-[30px] text-[12px] font-[600] text-white bg-btnPrimary disabled:opacity-50 border-t border-newBorder">
                    {addedIds.has(id) ? 'Added ✓' : '+ Add to ad'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
