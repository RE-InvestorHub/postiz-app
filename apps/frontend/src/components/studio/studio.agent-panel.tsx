'use client';

// Studio AI Agent panel — conversational chat wired to the workspace brain over SSE.
//
// Replaces the disabled scaffold. Key behaviors:
//   - Streams tokens from NEXT_PUBLIC_BRAIN_URL/agent/stream (or /api/brain/agent/stream)
//   - Renders tool_call events with Approve / Edit / Reject controls (or auto-applies
//     non-destructive setters via requiresApproval())
//   - Shows a completeness meter once answering has started
//   - Unlocks the "Create" button only after the brain emits brief_complete
//   - Applies approved/auto capability actions to the studio store via dispatchToolCall()
//
// OUR file — safe to edit freely. Does NOT touch any upstream Postiz component.

import {
  FC,
  FormEvent,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Capability,
} from '@gitroom/frontend/components/studio/studio.capabilities';
import {
  BrainEvent,
  streamToBrain,
} from '@gitroom/frontend/components/studio/studio.brain-client';
import {
  ChatMessage,
  ChatMessageProps,
  ToolCallDecision,
} from '@gitroom/frontend/components/studio/studio.chat-message';
import { CompletenessMeter } from '@gitroom/frontend/components/studio/studio.completeness-meter';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import {
  dispatchToolCall,
  requiresApproval,
} from '@gitroom/frontend/components/studio/studio.tool-dispatcher';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';
import { generateLogoFromSpec } from '@gitroom/frontend/components/studio/studio.brand-client';
import { renderDirectorShot, renderDirectorClip, gapFillVideo } from '@gitroom/frontend/components/studio/studio.director-client';
import { addKeyframes } from '@gitroom/frontend/components/studio/studio.video-client';

// Broadcast generation start/stop so panels (e.g. the Images library) can show a spinner.
function emitGenerating(active: boolean, kind?: string) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-generating', { detail: { active, kind } }));
}

/** Dispatch a kind's generator from the agent's final spec. Returns a human result line. */
async function runGeneration(kind: string, brandKitId: string, spec: Record<string, unknown>): Promise<string> {
  emitGenerating(true, kind);
  try {
    if (kind === 'logo') {
      const r = await generateLogoFromSpec(brandKitId, spec);
      return `Logo generated and applied to the ${r.slot} slot.`;
    }
    if (kind === 'shot') {
      const r = await renderDirectorShot(brandKitId, spec);
      // Tell the Images tab to refresh its library so the new shot appears.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh'));
      return `Ad shot rendered (${r.mode}) and added to your image library.`;
    }
    if (kind === 'videoshot') {
      // The interview settled an output: keyframe (still → pool), clip (one motion), or video
      // (gap-fill across numbered keyframes). Separate the control fields from the dimension spec.
      const { output = 'clip', motion, model, aspectRatio, durationS, keyframeIds, anchorId, renderMode, ...dimSpec } = spec as Record<string, any>;
      const refreshVideo = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh')); };
      if (output === 'keyframe') {
        const r = await renderDirectorShot(brandKitId, { ...dimSpec, renderMode, aspectRatio, anchorId });
        await addKeyframes([r.id]); // mark the still as a keyframe so it lands in the Video Library
        refreshVideo();
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh'));
        return `Keyframe rendered and added to the Video Library.`;
      }
      if (output === 'video') {
        const ids: string[] = Array.isArray(keyframeIds) ? keyframeIds : [];
        if (ids.length < 2) throw new Error('A gap-fill video needs ≥2 numbered keyframes — compose + number them first, then generate.');
        const r = await gapFillVideo(brandKitId, ids, { motion, model, aspectRatio, totalDurationS: durationS, style: dimSpec.style });
        refreshVideo();
        return `Gap-fill video rendered (${r.segments ?? ids.length - 1} segments) and added to the Video Library.`;
      }
      await renderDirectorClip(brandKitId, dimSpec, { motion, model, aspectRatio, durationS });
      refreshVideo();
      return `Motion clip rendered and added to the Video Library.`;
    }
    throw new Error(`No generator registered for "${kind}".`);
  } finally {
    emitGenerating(false, kind);
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InternalMessage = Omit<ChatMessageProps, 'decision'> & {
  _pendingToolName?: string;
  _pendingToolInput?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Icons (inline, MIT Lucide-style, currentColor)
// ---------------------------------------------------------------------------

const IconSpark: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 2a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.7A2 2 0 0 0 8.8 13L3 11l5.8-2a2 2 0 0 0 1.3-1.3L12 2z" />
  </svg>
);

const IconSend: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconStop: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const IconCreate: FC = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="16" />
    <line x1="8" y1="12" x2="16" y2="12" />
  </svg>
);

// Animated "thinking" indicator — three bouncing dots in an assistant-style bubble.
const TypingDots: FC = () => (
  <div
    className="self-start flex items-center gap-[4px] px-[12px] py-[10px] rounded-[8px] bg-newBgColorInner border border-[var(--new-table-border)]"
    aria-label="Agent is thinking"
    role="status"
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-[6px] h-[6px] rounded-full bg-ai animate-pulse"
        style={{ animationDelay: `${i * 200}ms`, animationDuration: '1.1s' }}
      />
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BRAIN_CONFIGURED =
  !!(typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL);

function makeId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const StudioAgentPanel: FC<{
  caps: Record<string, Capability>;
  onClose: () => void;
  /** Called with the final brief when the user clicks Create. */
  onCreate?: (brief: Record<string, unknown>) => void;
  /** Floating mode: fill the host window + hide the internal header (the window has one). */
  floating?: boolean;
  /** Prefill the message box (e.g. opened from the logo "Generate with AI" button). */
  initialInput?: string;
  /** Auto-send initialInput once on mount (e.g. "Script from a URL"): the agent replies
   *  immediately instead of parking the request in the box for the user to submit. */
  autoSend?: boolean;
  /** Generation-interview mode: the agent interviews for this kind; Create runs its generator. */
  generation?: { kind?: string; brandKitId?: string; slot?: string };
}> = ({ caps, onClose, onCreate, floating, initialInput, autoSend, generation }) => {
  const { state } = useStudio();
  const toaster = useToaster();
  // Chat state
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState(initialInput ?? '');
  // Generation-interview state: the agent's latest published plan + dropped reference assets.
  const genKind = generation?.kind;
  const [genPlan, setGenPlan] = useState<{ kind?: string; spec?: Record<string, unknown>; confidence?: number; ready?: boolean; summary?: string } | null>(null);
  const [refAssetIds, setRefAssetIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [showRefDrop, setShowRefDrop] = useState(false); // reference uploader popover open?
  const [streaming, setStreaming] = useState(false);
  const [conversationId] = useState<string | null>(null);

  // Completeness gate
  const [answered, setAnswered] = useState(0);
  // 11 = default question count; brain may override via brief_complete
  const [total] = useState(11);
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
  const briefReady = brief !== null;

  // Scroll anchor + the scrollable message list (we scroll the LIST directly, never the page).
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Stick-to-bottom: true while the user is at/near the bottom. Flipped ONLY by real user scrolls
  // (not by content growth), so fast streaming can't knock it loose. The user scrolling up to read
  // sets it false (we stop yanking); scrolling back to the bottom re-arms it.
  const stick = useRef(true);
  const onListScroll = useCallback(() => {
    const el = listRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }, []);

  // Keep the latest message in view as the conversation grows / streams — scroll the list
  // container itself (never scrollIntoView, which can scroll the whole page).
  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // ---------------------------------------------------------------------------
  // Message mutation helpers
  // ---------------------------------------------------------------------------

  const appendMessage = useCallback((msg: InternalMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const updateLastAssistant = useCallback((token: string) => {
    setMessages((prev) => {
      const copy = [...prev];
      // Find the last assistant streaming message to append to.
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant' && copy[i].streaming) {
          copy[i] = {
            ...copy[i],
            text: (copy[i].text ?? '') + token,
          };
          return copy;
        }
      }
      // No streaming assistant message yet — create one.
      copy.push({
        id: makeId(),
        role: 'assistant',
        text: token,
        streaming: true,
      });
      return copy;
    });
  }, []);

  const finalizeLastAssistant = useCallback(() => {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant' && copy[i].streaming) {
          copy[i] = { ...copy[i], streaming: false };
          return copy;
        }
      }
      return copy;
    });
  }, []);

  const updateToolCallStatus = useCallback(
    (id: string, status: 'applied' | 'rejected') => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, toolStatus: status } : m
        )
      );
    },
    []
  );

  // ---------------------------------------------------------------------------
  // Tool call resolution
  // ---------------------------------------------------------------------------

  const resolveToolCall = useCallback(
    async (
      msgId: string,
      toolName: string,
      input: Record<string, unknown>
    ) => {
      const result = await dispatchToolCall(toolName, input, caps);
      updateToolCallStatus(msgId, 'applied');
      if (!result.ok) {
        appendMessage({
          id: makeId(),
          role: 'system',
          text: result.message,
        });
      }
      // Increment answered count for non-generate calls (they advance the brief).
      if (toolName !== 'studio.generate') {
        setAnswered((n) => n + 1);
      }
    },
    [caps, updateToolCallStatus, appendMessage]
  );

  const handleToolCallEvent = useCallback(
    async (name: string, toolInput: Record<string, unknown>) => {
      const msgId = makeId();

      if (!requiresApproval(name)) {
        // Auto-apply non-destructive setters — show subtle applied pill.
        appendMessage({
          id: msgId,
          role: 'tool_call',
          toolName: name,
          toolInput,
          toolStatus: 'applied',
        });
        await resolveToolCall(msgId, name, toolInput);
      } else {
        // Show pending approval card.
        appendMessage({
          id: msgId,
          role: 'tool_call',
          toolName: name,
          toolInput,
          toolStatus: 'pending',
          _pendingToolName: name,
          _pendingToolInput: toolInput,
        });
      }
    },
    [appendMessage, resolveToolCall]
  );

  // ---------------------------------------------------------------------------
  // Stream handler
  // ---------------------------------------------------------------------------

  const handleEvent = useCallback(
    (event: BrainEvent) => {
      switch (event.type) {
        case 'text':
          updateLastAssistant(event.token);
          break;

        case 'tool_call':
          // Finalize any open streaming bubble first.
          finalizeLastAssistant();
          // generation_plan is a signal (not a capability): capture it to drive the
          // confidence meter + Create gate. Don't render it as a tool-call card.
          if (event.name === 'generation_plan') {
            setGenPlan((event.input as { confidence?: number }) || null);
          } else if (event.name === 'image_edit' || event.name === 'image_magick') {
            // Graphics edit: the brain already ran the op + recorded the new variant. Refresh the
            // library AND tell it to select the new variant (via the event detail) so the canvas
            // moves to the edited result and the user's next message continues from it. The images
            // panel owns the selection (local selectedId) and syncs it back to the store.
            if (event.result?.id) {
              if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:images-refresh', { detail: { selectImageId: event.result.id } }));
              appendMessage({ id: makeId(), role: 'tool_call', toolName: event.name, toolInput: event.input, toolStatus: 'applied' });
            } else {
              appendMessage({ id: makeId(), role: 'system', text: event.error ? `Edit rejected: ${event.error}` : 'Edit did not produce a variant.' });
            }
          } else {
            handleToolCallEvent(event.name, event.input);
          }
          break;

        case 'brief_complete':
          finalizeLastAssistant();
          setBrief(event.brief);
          // Count answered as total (brief is complete).
          setAnswered(total);
          appendMessage({
            id: makeId(),
            role: 'system',
            text: 'Brief complete — the Create button is now active.',
          });
          break;

        case 'done':
          finalizeLastAssistant();
          setStreaming(false);
          break;

        case 'error':
          finalizeLastAssistant();
          setStreaming(false);
          appendMessage({
            id: makeId(),
            role: 'system',
            text: `Error: ${event.message}`,
          });
          break;
      }
    },
    [
      updateLastAssistant,
      finalizeLastAssistant,
      handleToolCallEvent,
      appendMessage,
      total,
    ]
  );

  // ---------------------------------------------------------------------------
  // Send
  // ---------------------------------------------------------------------------

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!BRAIN_CONFIGURED) return;

    // Append user message.
    appendMessage({ id: makeId(), role: 'user', text });
    setInput('');
    setStreaming(true);

    abortRef.current = streamToBrain(text, conversationId, {
      onEvent: handleEvent,
      onAbort: () => {
        finalizeLastAssistant();
        setStreaming(false);
      },
    }, generation?.brandKitId || state.composerBrandKitId, genKind ? { kind: genKind, ...(generation?.slot ? { slot: generation.slot } : {}) } : null,
      // The general agent gets the currently-selected library image (so it can see/act on it);
      // generation-interview agents have their own reference flow.
      genKind ? null : (state.selectedImageId || null));
  }, [
    input,
    streaming,
    conversationId,
    appendMessage,
    handleEvent,
    finalizeLastAssistant,
    state.composerBrandKitId,
    state.selectedImageId,
    generation?.brandKitId,
    genKind,
  ]);

  // Auto-send the seed once on mount (autoSend, e.g. "Script from a URL"): fire the
  // request straight into the agent so it replies immediately, no manual submit. The
  // ref guards against React re-runs (deps change after send clears the input).
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSend && !autoSentRef.current && (initialInput ?? '').trim() && BRAIN_CONFIGURED && !streaming) {
      autoSentRef.current = true;
      send();
    }
  }, [autoSend, initialInput, streaming, send]);

  // A dropped reference image: remember it (injected into the spec at Create) and tell the
  // agent so it factors the reference into its plan/confidence.
  const onRefUpload = useCallback((asset: UploadedAsset) => {
    setShowRefDrop(false);
    setRefAssetIds((ids) => (ids.includes(asset.assetId) ? ids : [...ids, asset.assetId]));
    appendMessage({ id: makeId(), role: 'system', text: 'Reference image added — the agent will use it as an example.' });
    if (!streaming && BRAIN_CONFIGURED) {
      setStreaming(true);
      abortRef.current = streamToBrain(
        "I've added a reference logo I like — please use it as a style example.",
        conversationId,
        { onEvent: handleEvent, onAbort: () => { finalizeLastAssistant(); setStreaming(false); } },
        generation?.brandKitId || state.composerBrandKitId,
        genKind ? { kind: genKind, ...(generation?.slot ? { slot: generation.slot } : {}) } : null
      );
    }
  }, [streaming, conversationId, handleEvent, finalizeLastAssistant, appendMessage, generation?.brandKitId, state.composerBrandKitId, genKind]);

  // The human Create gate (generation mode): run the kind's generator from the agent's spec.
  const doGenerate = useCallback(async () => {
    if (!genKind || !genPlan?.spec || generating) return;
    const brandKitId = generation?.brandKitId || state.composerBrandKitId;
    setGenerating(true);
    try {
      const spec = { ...genPlan.spec, ...(generation?.slot ? { slot: generation.slot } : {}), referenceAssetIds: refAssetIds };
      // Video gap-fill (videoshot, output 'video') morphs the numbered keyframe pool — inject the ids.
      if (genKind === 'videoshot') (spec as Record<string, unknown>).keyframeIds = state.videoKeyframes.map((k) => k.id);
      const line = await runGeneration(genKind, brandKitId, spec);
      toaster.show(line, 'success');
      // Tell the Brand tab to refresh so the new logo shows in its slot.
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:brand-refresh'));
      if (generation?.slot) {
        // Pre-scoped to one slot → done, close the window.
        onClose();
      } else {
        // Slot-picker mode → loop: reset the plan and ask the agent which target is next
        // (it re-streams with the now-updated brand context, so it knows what's still empty).
        setGenPlan(null);
        setRefAssetIds([]);
        appendMessage({ id: makeId(), role: 'system', text: line });
        if (BRAIN_CONFIGURED) {
          setStreaming(true);
          abortRef.current = streamToBrain(
            `Done — that one's generated. Which logo slot should we work on next?`,
            conversationId,
            { onEvent: handleEvent, onAbort: () => { finalizeLastAssistant(); setStreaming(false); } },
            brandKitId,
            { kind: genKind }
          );
        }
      }
    } catch (e) {
      appendMessage({ id: makeId(), role: 'system', text: `Generation failed: ${(e as Error)?.message ?? e}` });
    } finally { setGenerating(false); }
  }, [genKind, genPlan, generating, generation?.brandKitId, generation?.slot, refAssetIds, state.composerBrandKitId, state.videoKeyframes, toaster, onClose, appendMessage, conversationId, handleEvent, finalizeLastAssistant]);

  // Create gate: in generation mode, lit only when the agent published ready + ≥95% confidence.
  const genReady = !!genPlan?.ready && (genPlan?.confidence ?? 0) >= 0.95;

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    },
    [send]
  );

  const onSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      send();
    },
    [send]
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Show the thinking dots from Send until the first assistant token streams in
  // (also covers tool-only turns where no text arrives).
  const assistantStreamingWithText = messages.some(
    (m) => m.role === 'assistant' && m.streaming && (m.text ?? '').length > 0
  );
  const showThinking = streaming && !assistantStreamingWithText;

  return (
    <div className={floating
      ? 'w-full h-full bg-newBgColor flex flex-col'
      // Sidebar: bound to the viewport + sticky so it stays in view and the message list scrolls
      // INSIDE it as the conversation grows (instead of stretching the page). self-start keeps the
      // flex row from stretching it to content height.
      : 'w-[320px] shrink-0 self-start sticky top-[16px] h-[calc(100vh-32px)] max-h-[calc(100vh-32px)] bg-newBgColor border-l border-[var(--new-table-border)] flex flex-col'}>
      {/* Header — hidden in floating mode (the floating window provides its own title bar) */}
      {!floating && (
        <div className="flex items-center justify-between px-[16px] py-[12px] border-b border-[var(--new-table-border)]">
          <div className="flex items-center gap-[8px]">
            <span className="w-[8px] h-[8px] rounded-full bg-ai" />
            <span className="text-[14px] font-[600] text-btnText">AI Agent</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--new-table-text)] hover:text-btnText text-[18px] leading-none"
            aria-label="Close agent panel"
          >
            ×
          </button>
        </div>
      )}

      {/* Completeness meter */}
      {answered > 0 && (
        <div className="px-[16px] pt-[12px] pb-[4px] border-b border-[var(--new-bgLineColor)]">
          <CompletenessMeter answered={answered} total={total} />
        </div>
      )}

      {/* Message list — min-h-0 lets this flex child actually scroll instead of growing the panel. */}
      <div ref={listRef} onScroll={onListScroll} className="flex-1 min-h-0 overflow-y-auto p-[16px] flex flex-col gap-[12px]">
        {messages.length === 0 && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[12px] text-[var(--new-table-text)] leading-[1.5]">
              {!BRAIN_CONFIGURED
                ? 'Connect the brain (NEXT_PUBLIC_BRAIN_URL) to enable the agent.'
                : genKind
                  ? `Tell me what kind of ${genKind} you're after. I'll ask a few questions — and drop in any ${genKind}s you like as examples. Create lights up once I'm confident I can make it.`
                  : 'Ask the agent to help set up your content brief. It will drive the Studio controls as you answer its questions.'}
            </p>
          </div>
        )}

        {messages.map((msg) => {
          // Wire up decision callbacks for pending tool calls.
          let decision: ToolCallDecision | undefined;
          if (msg.role === 'tool_call' && msg.toolStatus === 'pending') {
            const toolName = msg._pendingToolName!;
            const toolInput = msg._pendingToolInput!;
            const msgId = msg.id;
            decision = {
              onApprove: () => resolveToolCall(msgId, toolName, toolInput),
              onReject: () => updateToolCallStatus(msgId, 'rejected'),
              onEdit: (editedJson) => {
                try {
                  const parsed = JSON.parse(editedJson) as Record<string, unknown>;
                  resolveToolCall(msgId, toolName, parsed);
                } catch {
                  // ignore — the editor already validates before calling onEdit
                }
              },
            };
          }

          return (
            <ChatMessage
              key={msg.id}
              id={msg.id}
              role={msg.role}
              text={msg.text}
              streaming={msg.streaming}
              toolName={msg.toolName}
              toolInput={msg.toolInput}
              toolStatus={msg.toolStatus}
              decision={decision}
            />
          );
        })}

        {showThinking && <TypingDots />}

        <div ref={bottomRef} />
      </div>

      {/* Generation-interview gate: confidence meter + a thin reference-upload toggle */}
      {genKind && (
        <div className="px-[12px] pt-[10px] flex flex-col gap-[8px] border-t border-[var(--new-table-border)]">
          <div className="flex items-center gap-[8px]">
            <span className="text-[11px] text-textItemBlur shrink-0">Confidence</span>
            <span className="flex-1 h-[6px] rounded-full bg-newBgColorInner overflow-hidden">
              <span className="block h-full bg-ai transition-all" style={{ width: `${Math.round((genPlan?.confidence ?? 0) * 100)}%` }} />
            </span>
            <span className="text-[11px] font-[600] shrink-0" style={{ color: genReady ? '#1db97a' : undefined }}>{Math.round((genPlan?.confidence ?? 0) * 100)}%</span>
            <button type="button" onClick={() => setShowRefDrop((v) => !v)} title="Upload reference images"
              className={'shrink-0 h-[22px] px-[8px] rounded-[6px] border text-[10px] font-[600] ' + (showRefDrop ? 'border-ai text-ai bg-ai/10' : 'border-newBorder text-textItemBlur hover:text-btnText')}>
              ⬆ Upload{refAssetIds.length ? ` (${refAssetIds.length})` : ''}
            </button>
          </div>
          {showRefDrop && (
            <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[8px]">
              <StudioDropZone accept="image" onUploaded={onRefUpload} />
            </div>
          )}
        </div>
      )}

      {/* Input + Create footer */}
      <div className="p-[12px] border-t border-[var(--new-table-border)] flex flex-col gap-[8px]">
        {/* Create button — generation mode gates on confidence ≥ 95%; brief mode on brief_complete */}
        {genKind ? (
          <button
            type="button"
            disabled={!genReady || generating}
            onClick={doGenerate}
            className={[
              'w-full flex items-center justify-center gap-[6px]',
              'h-[40px] rounded-[8px] font-[600] text-[13px] transition-colors',
              genReady && !generating
                ? 'bg-btnPrimary text-white cursor-pointer hover:opacity-90'
                : 'bg-btnSimple text-[var(--new-table-text)] opacity-50 cursor-not-allowed',
            ].join(' ')}
            title={genReady ? `Generate the ${genKind} (uses image credits)` : 'Keep answering — Create unlocks at 95% confidence'}
          >
            <IconCreate />
            {generating ? 'Generating…' : `Create ${genKind}`}
          </button>
        ) : (
          <button
            type="button"
            disabled={!briefReady}
            onClick={() => brief && onCreate?.(brief)}
            className={[
              'w-full flex items-center justify-center gap-[6px]',
              'h-[40px] rounded-[8px] font-[600] text-[13px] transition-colors',
              briefReady
                ? 'bg-btnPrimary text-white cursor-pointer hover:opacity-90'
                : 'bg-btnSimple text-[var(--new-table-text)] opacity-50 cursor-not-allowed',
            ].join(' ')}
            aria-label={briefReady ? 'Create content' : 'Answer all questions to unlock Create'}
            title={briefReady ? 'Start content creation' : 'Answer the agent\'s questions to unlock Create'}
          >
            <IconCreate />
            Create
          </button>
        )}

        {/* Chat input */}
        <form onSubmit={onSubmit} className="flex gap-[8px]">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!BRAIN_CONFIGURED || streaming}
            placeholder={
              !BRAIN_CONFIGURED
                ? 'Agent not connected'
                : streaming
                ? 'Agent is responding…'
                : 'Ask the agent… (Enter to send)'
            }
            rows={1}
            className="flex-1 min-h-[40px] max-h-[50vh] px-[12px] py-[10px] rounded-[8px] bg-newBgColorInner border border-[var(--new-table-border)] text-[13px] text-btnText placeholder:text-[var(--new-table-text)] disabled:opacity-60 resize-y leading-[1.4] overflow-y-auto"
          />
          <button
            type={streaming ? 'button' : 'submit'}
            onClick={streaming ? stopStream : undefined}
            disabled={!BRAIN_CONFIGURED || (!streaming && !input.trim())}
            className={[
              'h-[40px] w-[40px] shrink-0 rounded-[8px] flex items-center justify-center font-[600]',
              'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
              streaming ? 'bg-btnSimple text-btnText' : 'bg-ai text-white',
            ].join(' ')}
            aria-label={streaming ? 'Stop streaming' : 'Send message'}
          >
            {streaming ? <IconStop /> : <IconSend />}
          </button>
        </form>
      </div>
    </div>
  );
};
