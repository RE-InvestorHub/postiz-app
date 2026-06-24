'use client';

// Studio — Remotion Video Editor Panel
//
// The ADVANCED human-facing editing surface in the Studio's "Video Editor" tab.
// Conversational editing (talk-to-the-agent) is the default; this panel is the
// optional hands-on form for users who want to tweak template props directly.
//
// Architecture:
//   1. Fetches composition list + prop schemas from the brain proxy
//      (GET /api/brain/render/compositions, GET /api/brain/render/formats).
//   2. Renders a form auto-generated from each composition's `schema` —
//      text / number / boolean / nullable-string fields.
//   3. On "Render" POSTs to the brain proxy (POST /api/brain/render/job)
//      and polls the job (GET /api/brain/render/job/:id) every 3 s.
//   4. Shows the rendered MP4 inline when done.
//   5. Agent handoff: accepts optional `initialCompositionId` + `initialProps`
//      so the agent can pre-populate the form and hand off to human approval.
//
// Postiz design tokens only — no Re:InvestorHub brand in this UI.
// All new files, no upstream Postiz edits.

import {
  FC,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from 'react';
import {
  CompositionMeta,
  FormatMeta,
  RenderJobStatus,
  fetchCompositions,
  fetchFormats,
  enqueueRender,
  pollRenderJob,
  PropFieldSchema,
} from '@gitroom/frontend/components/studio/studio.remotion-client';

// ---------------------------------------------------------------------------
// Local state — scoped to this panel; independent of the Studio global store.
// ---------------------------------------------------------------------------

interface EditorState {
  /** null = not yet loaded */
  compositions: CompositionMeta[] | null;
  formats: Record<string, FormatMeta> | null;
  loadError: string | null;
  selectedCompositionId: string | null;
  selectedFormat: string;
  /** Current prop values — keyed by field name */
  props: Record<string, unknown>;
  renderStatus: 'idle' | 'submitting' | 'polling' | 'done' | 'error';
  job: RenderJobStatus | null;
  renderError: string | null;
}

type EditorAction =
  | { type: 'LOADED'; compositions: CompositionMeta[]; formats: Record<string, FormatMeta> }
  | { type: 'LOAD_ERROR'; message: string }
  | { type: 'SELECT_COMPOSITION'; id: string; defaultProps: Record<string, unknown>; defaultFormat: string }
  | { type: 'SELECT_FORMAT'; format: string }
  | { type: 'SET_PROP'; key: string; value: unknown }
  | { type: 'SUBMIT' }
  | { type: 'JOB_UPDATE'; job: RenderJobStatus }
  | { type: 'RENDER_ERROR'; message: string }
  | { type: 'RESET_RENDER' };

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'LOADED':
      return {
        ...state,
        compositions: action.compositions,
        formats: action.formats,
        loadError: null,
        // Auto-select first composition
        selectedCompositionId: action.compositions[0]?.id ?? null,
        selectedFormat: action.compositions[0]?.defaultFormat ?? 'reels',
        props: action.compositions[0]?.defaultProps ?? {},
      };
    case 'LOAD_ERROR':
      return { ...state, loadError: action.message, compositions: null };
    case 'SELECT_COMPOSITION':
      return {
        ...state,
        selectedCompositionId: action.id,
        selectedFormat: action.defaultFormat,
        props: action.defaultProps,
        renderStatus: 'idle',
        job: null,
        renderError: null,
      };
    case 'SELECT_FORMAT':
      return { ...state, selectedFormat: action.format };
    case 'SET_PROP':
      return { ...state, props: { ...state.props, [action.key]: action.value } };
    case 'SUBMIT':
      return { ...state, renderStatus: 'submitting', job: null, renderError: null };
    case 'JOB_UPDATE':
      return {
        ...state,
        job: action.job,
        renderStatus:
          action.job.status === 'done'
            ? 'done'
            : action.job.status === 'error'
            ? 'error'
            : 'polling',
        renderError: action.job.status === 'error' ? (action.job.error ?? 'Render failed.') : null,
      };
    case 'RENDER_ERROR':
      return { ...state, renderStatus: 'error', renderError: action.message };
    case 'RESET_RENDER':
      return { ...state, renderStatus: 'idle', job: null, renderError: null };
    default:
      return state;
  }
}

const initialEditorState: EditorState = {
  compositions: null,
  formats: null,
  loadError: null,
  selectedCompositionId: null,
  selectedFormat: 'reels',
  props: {},
  renderStatus: 'idle',
  job: null,
  renderError: null,
};

// ---------------------------------------------------------------------------
// Inline icons (Lucide-style, MIT, currentColor)
// ---------------------------------------------------------------------------
const IconFilm: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M7 3v18M17 3v18M3 7h4M3 12h18M3 17h4M17 7h4M17 17h4" />
  </svg>
);
const IconSpinner: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);
const IconCheck: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const IconWarn: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4M12 17h.01" />
  </svg>
);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const inputCls =
  'w-full h-[40px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur focus:outline-none focus:border-btnPrimary transition-colors';

const textareaCls =
  'w-full px-[10px] py-[8px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y focus:outline-none focus:border-btnPrimary transition-colors';

/** Render one prop field based on its schema type. */
const PropField: FC<{
  fieldKey: string;
  schema: PropFieldSchema;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}> = ({ fieldKey, schema, value, onChange }) => {
  if (schema.type === 'array') {
    // Arrays (e.g., captions) — show as JSON textarea for manual editing.
    // Conversational editing is preferred; this is the power-user escape hatch.
    return (
      <div className="flex flex-col gap-[6px]">
        <label className="text-[12px] font-[500] text-textItemBlur">{schema.label}</label>
        <textarea
          className={`${textareaCls} min-h-[80px] font-mono text-[11px]`}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2)}
          onChange={(e) => {
            try {
              onChange(fieldKey, JSON.parse(e.target.value));
            } catch {
              // Pass the raw string through — user may still be typing
              onChange(fieldKey, e.target.value);
            }
          }}
          placeholder="[]"
        />
        <p className="text-[11px] text-textItemBlur leading-[1.4]">
          JSON array of <code className="text-ai text-[10px]">{"{text, startFrame, endFrame}"}</code> objects.
          Use the AI agent to generate captions automatically.
        </p>
      </div>
    );
  }

  if (schema.type === 'boolean') {
    return (
      <label className="flex items-center gap-[10px] cursor-pointer">
        <div
          role="checkbox"
          aria-checked={!!value}
          tabIndex={0}
          onClick={() => onChange(fieldKey, !value)}
          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange(fieldKey, !value)}
          className={`w-[40px] h-[22px] rounded-full transition-colors shrink-0 flex items-center px-[2px] ${value ? 'bg-btnPrimary' : 'bg-newBgColor border border-newBorder'}`}
        >
          <span
            className={`w-[18px] h-[18px] rounded-full bg-white transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-0'}`}
          />
        </div>
        <span className="text-[13px] text-btnText">{schema.label}</span>
      </label>
    );
  }

  if (schema.type === 'number') {
    return (
      <div className="flex flex-col gap-[6px]">
        <label className="text-[12px] font-[500] text-textItemBlur">{schema.label}</label>
        <div className="flex items-center gap-[10px]">
          <input
            type="range"
            min={schema.min ?? 0}
            max={schema.max ?? 1}
            step={schema.step ?? 0.01}
            value={typeof value === 'number' ? value : Number(value ?? schema.min ?? 0)}
            onChange={(e) => onChange(fieldKey, parseFloat(e.target.value))}
            className="flex-1 accent-btnPrimary"
          />
          <input
            type="number"
            min={schema.min}
            max={schema.max}
            step={schema.step ?? 0.01}
            value={typeof value === 'number' ? value : Number(value ?? schema.min ?? 0)}
            onChange={(e) => onChange(fieldKey, parseFloat(e.target.value))}
            className={`${inputCls} w-[80px]`}
          />
        </div>
      </div>
    );
  }

  // string (nullable or not)
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] font-[500] text-textItemBlur">{schema.label}</label>
      <input
        type="text"
        value={typeof value === 'string' ? value : (value == null ? '' : String(value))}
        onChange={(e) => onChange(fieldKey, e.target.value || (schema.nullable ? null : ''))}
        placeholder={schema.nullable ? '(none)' : ''}
        className={inputCls}
      />
    </div>
  );
};

/** Format selector row. */
const FormatSelector: FC<{
  formats: Record<string, FormatMeta>;
  selected: string;
  onSelect: (key: string) => void;
}> = ({ formats, selected, onSelect }) => (
  <div className="flex flex-col gap-[6px]">
    <label className="text-[12px] font-[500] text-textItemBlur">Output format</label>
    <div className="flex flex-wrap gap-[6px]">
      {Object.entries(formats).map(([key, meta]) => (
        <button
          key={key}
          type="button"
          onClick={() => onSelect(key)}
          className={`h-[36px] px-[12px] rounded-[8px] text-[12px] font-[500] transition-colors border ${
            selected === key
              ? 'bg-btnPrimary text-white border-btnPrimary'
              : 'bg-newBgColor border-newBorder text-textItemBlur hover:bg-boxHover hover:text-btnText'
          }`}
        >
          {meta.label}
        </button>
      ))}
    </div>
  </div>
);

/** Job status indicator. */
const JobStatusBadge: FC<{ job: RenderJobStatus }> = ({ job }) => {
  const statusConfig = {
    queued:    { icon: <IconSpinner />, label: 'Queued',    cls: 'text-textItemBlur' },
    rendering: { icon: <IconSpinner />, label: 'Rendering…', cls: 'text-ai' },
    done:      { icon: <IconCheck />,   label: 'Done',      cls: 'text-green-400' },
    error:     { icon: <IconWarn />,    label: 'Error',     cls: 'text-red-400' },
  } as const;

  const cfg = statusConfig[job.status] ?? statusConfig.queued;

  return (
    <div className={`flex items-center gap-[6px] text-[13px] ${cfg.cls}`}>
      {cfg.icon}
      <span>{cfg.label}</span>
      {job.status === 'rendering' && job.progress != null && (
        <span className="text-[11px]">({Math.round(job.progress * 100)}%)</span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Unavailable state shown when the render proxy is not yet live
// ---------------------------------------------------------------------------
const RenderProxyUnavailable: FC = () => (
  <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgColor p-[24px] flex flex-col gap-[12px]">
    <div className="flex items-center gap-[8px]">
      <span className="w-[28px] h-[28px] rounded-[8px] bg-btnPrimary/15 text-btnPrimary flex items-center justify-center">
        <IconFilm />
      </span>
      <span className="text-[14px] font-[600] text-btnText">Render service not connected</span>
    </div>
    <p className="text-[13px] text-textItemBlur leading-[1.5] max-w-[480px]">
      The Remotion render service runs on port 4011 and must be proxied via the brain.
      Add these routes to <code className="text-ai text-[11px]">brain/</code>:
    </p>
    <ul className="flex flex-col gap-[4px] ml-[4px]">
      {[
        'GET  /render/compositions → :4011/compositions',
        'GET  /render/formats      → :4011/formats',
        'POST /render/job          → :4011/render',
        'GET  /render/job/:id      → :4011/jobs/:id',
      ].map((line) => (
        <li key={line}>
          <code className="text-[11px] text-ai bg-ai/10 px-[6px] py-[2px] rounded-[4px]">{line}</code>
        </li>
      ))}
    </ul>
    <p className="text-[11px] text-textItemBlur">
      Once live, this panel auto-populates from the composition registry.
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export interface RemotionEditorProps {
  /** Pre-select a composition — used for agent handoff. */
  initialCompositionId?: string;
  /** Pre-populate props — used for agent handoff. */
  initialProps?: Record<string, unknown>;
}

export const RemotionEditorPanel: FC<RemotionEditorProps> = ({
  initialCompositionId,
  initialProps,
}) => {
  const [state, dispatch] = useReducer(editorReducer, initialEditorState);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load compositions + formats on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [comps, fmts] = await Promise.all([fetchCompositions(), fetchFormats()]);
      if (cancelled) return;
      if (!comps || !fmts) {
        dispatch({ type: 'LOAD_ERROR', message: 'Render service unavailable' });
        return;
      }
      dispatch({ type: 'LOADED', compositions: comps, formats: fmts });

      // Apply agent handoff pre-selection if provided
      if (initialCompositionId) {
        const comp = comps.find((c) => c.id === initialCompositionId);
        if (comp) {
          dispatch({
            type: 'SELECT_COMPOSITION',
            id: comp.id,
            defaultProps: { ...comp.defaultProps, ...(initialProps ?? {}) },
            defaultFormat: comp.defaultFormat,
          });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [initialCompositionId, initialProps]);

  // Polling — start when a job is queued/rendering, stop when done/error
  useEffect(() => {
    if (state.renderStatus !== 'polling') {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    if (pollTimerRef.current) return; // already polling
    pollTimerRef.current = setInterval(async () => {
      if (!state.job?.jobId) return;
      const updated = await pollRenderJob(state.job.jobId);
      if (updated) {
        dispatch({ type: 'JOB_UPDATE', job: updated });
      }
    }, 3000);
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [state.renderStatus, state.job?.jobId]);

  const handleSelectComposition = useCallback(
    (id: string) => {
      const comp = state.compositions?.find((c) => c.id === id);
      if (!comp) return;
      dispatch({
        type: 'SELECT_COMPOSITION',
        id: comp.id,
        defaultProps: comp.defaultProps,
        defaultFormat: comp.defaultFormat,
      });
    },
    [state.compositions]
  );

  const handlePropChange = useCallback((key: string, value: unknown) => {
    dispatch({ type: 'SET_PROP', key, value });
  }, []);

  const handleRender = useCallback(async () => {
    if (!state.selectedCompositionId) return;
    dispatch({ type: 'SUBMIT' });
    const result = await enqueueRender({
      compositionId: state.selectedCompositionId,
      format: state.selectedFormat,
      props: state.props,
    });
    if (!result.ok || !result.jobId) {
      dispatch({ type: 'RENDER_ERROR', message: result.message });
      return;
    }
    dispatch({
      type: 'JOB_UPDATE',
      job: { jobId: result.jobId, status: 'queued' },
    });
  }, [state.selectedCompositionId, state.selectedFormat, state.props]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Loading state
  if (!state.compositions && !state.loadError) {
    return (
      <div className="flex items-center gap-[10px] text-textItemBlur text-[13px] py-[20px]">
        <IconSpinner />
        <span>Loading composition registry…</span>
      </div>
    );
  }

  // Proxy not yet live
  if (state.loadError || !state.compositions) {
    return <RenderProxyUnavailable />;
  }

  const selectedComp = state.compositions.find((c) => c.id === state.selectedCompositionId);
  const hasEditableProps = selectedComp
    ? Object.keys(selectedComp.schema).length > 0
    : false;

  const isRendering = state.renderStatus === 'submitting' || state.renderStatus === 'polling';

  return (
    <div className="flex flex-col gap-[20px]">
      {/* Header */}
      <div className="flex items-center gap-[8px]">
        <span className="w-[28px] h-[28px] rounded-[8px] bg-btnPrimary/15 text-btnPrimary flex items-center justify-center">
          <IconFilm />
        </span>
        <div>
          <div className="text-[14px] font-[600] text-btnText">Remotion Video Editor</div>
          <div className="text-[12px] text-textItemBlur">Advanced template editor — tweak props and render per platform</div>
        </div>
      </div>

      {/* Composition picker */}
      <div className="flex flex-col gap-[6px]">
        <label className="text-[12px] font-[500] text-textItemBlur">Template</label>
        <select
          value={state.selectedCompositionId ?? ''}
          onChange={(e) => handleSelectComposition(e.target.value)}
          className={`h-[40px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText focus:outline-none focus:border-btnPrimary transition-colors`}
        >
          {state.compositions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {selectedComp && (
          <p className="text-[12px] text-textItemBlur leading-[1.4]">{selectedComp.description}</p>
        )}
      </div>

      {/* Format selector */}
      {state.formats && (
        <FormatSelector
          formats={state.formats}
          selected={state.selectedFormat}
          onSelect={(fmt) => dispatch({ type: 'SELECT_FORMAT', format: fmt })}
        />
      )}

      {/* Props form */}
      {selectedComp && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[16px]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-[600] text-btnText">Template props</span>
            {!hasEditableProps && (
              <span className="text-[11px] text-textItemBlur">No user-facing props for this template</span>
            )}
          </div>

          {hasEditableProps ? (
            <div className="flex flex-col gap-[14px]">
              {Object.entries(selectedComp.schema).map(([key, fieldSchema]) => (
                <PropField
                  key={key}
                  fieldKey={key}
                  schema={fieldSchema}
                  value={state.props[key]}
                  onChange={handlePropChange}
                />
              ))}
            </div>
          ) : (
            <div className="text-[12px] text-textItemBlur leading-[1.4]">
              This template&apos;s content is baked in. Use the AI agent to switch templates
              or adjust composition settings (format, duration) before rendering.
            </div>
          )}
        </div>
      )}

      {/* Render button + status */}
      <div className="flex flex-col gap-[10px]">
        <div className="flex items-center gap-[10px] flex-wrap">
          <button
            type="button"
            disabled={isRendering || !state.selectedCompositionId}
            onClick={handleRender}
            className="h-[44px] px-[20px] rounded-[8px] bg-btnPrimary text-white font-[600] text-[13px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-[8px] transition-opacity"
          >
            {isRendering ? (
              <>
                <IconSpinner />
                {state.renderStatus === 'submitting' ? 'Submitting…' : 'Rendering…'}
              </>
            ) : (
              'Render video'
            )}
          </button>

          {state.renderStatus !== 'idle' && state.job && (
            <JobStatusBadge job={state.job} />
          )}

          {state.renderStatus !== 'idle' && (
            <button
              type="button"
              onClick={() => dispatch({ type: 'RESET_RENDER' })}
              className="text-[12px] text-textItemBlur hover:text-btnText transition-colors"
            >
              Reset
            </button>
          )}
        </div>

        {state.renderError && (
          <div className="flex items-start gap-[8px] rounded-[8px] bg-red-500/10 border border-red-500/20 px-[12px] py-[10px]">
            <span className="text-red-400 mt-[1px] shrink-0"><IconWarn /></span>
            <span className="text-[12px] text-red-300 leading-[1.5]">{state.renderError}</span>
          </div>
        )}
      </div>

      {/* Output preview */}
      {state.job?.status === 'done' && state.job.outputUrl && (
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-[600] text-btnText">Rendered output</span>
            <a
              href={state.job.outputUrl}
              download
              className="text-[12px] text-btnPrimary hover:text-btnPrimary/80 transition-colors"
            >
              Download MP4
            </a>
          </div>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            src={state.job.outputUrl}
            controls
            playsInline
            className="w-full max-h-[420px] rounded-[8px] border border-newBorder bg-black"
          />
          {/* Caption file links */}
          {(state.job.srtUrl || state.job.vttUrl) && (
            <div className="flex gap-[12px] text-[12px]">
              {state.job.srtUrl && (
                <a href={state.job.srtUrl} download className="text-btnPrimary hover:text-btnPrimary/80">
                  Download .srt
                </a>
              )}
              {state.job.vttUrl && (
                <a href={state.job.vttUrl} download className="text-btnPrimary hover:text-btnPrimary/80">
                  Download .vtt
                </a>
              )}
            </div>
          )}
          <p className="text-[11px] text-textItemBlur">
            Job <code className="text-ai text-[10px]">{state.job.jobId}</code> —{' '}
            attach this video to a post via the composer.
          </p>
        </div>
      )}

      {/* Agent handoff info note */}
      <div className="rounded-[8px] bg-ai/8 border border-ai/20 px-[14px] py-[10px] flex items-start gap-[8px]">
        <span className="text-ai shrink-0 mt-[1px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 2a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.7A2 2 0 0 0 8.8 13L3 11l5.8-2a2 2 0 0 0 1.3-1.3L12 2z" />
          </svg>
        </span>
        <span className="text-[12px] text-textItemBlur leading-[1.5]">
          <strong className="text-btnText font-[500]">Conversational editing is the default.</strong>{' '}
          Tell the AI agent what to change and it will update the template props and re-render.
          This form is the advanced surface for direct prop control.
        </span>
      </div>
    </div>
  );
};

export default RemotionEditorPanel;
