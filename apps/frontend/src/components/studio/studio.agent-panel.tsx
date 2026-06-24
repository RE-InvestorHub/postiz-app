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
  listCapabilities,
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
import {
  dispatchToolCall,
  requiresApproval,
} from '@gitroom/frontend/components/studio/studio.tool-dispatcher';

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
}> = ({ caps, onClose, onCreate }) => {
  const capabilities = listCapabilities(caps);

  // Chat state
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [conversationId] = useState<string | null>(null);

  // Completeness gate
  const [answered, setAnswered] = useState(0);
  // 11 = default question count; brain may override via brief_complete
  const [total] = useState(11);
  const [brief, setBrief] = useState<Record<string, unknown> | null>(null);
  const briefReady = brief !== null;

  // Scroll anchor
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
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
          handleToolCallEvent(event.name, event.input);
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
    });
  }, [
    input,
    streaming,
    conversationId,
    appendMessage,
    handleEvent,
    finalizeLastAssistant,
  ]);

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
    <div className="w-[320px] shrink-0 bg-newBgColor border-l border-[var(--new-table-border)] flex flex-col h-full">
      {/* Header */}
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

      {/* Completeness meter */}
      {answered > 0 && (
        <div className="px-[16px] pt-[12px] pb-[4px] border-b border-[var(--new-bgLineColor)]">
          <CompletenessMeter answered={answered} total={total} />
        </div>
      )}

      {/* Message list */}
      <div className="flex-1 overflow-y-auto p-[16px] flex flex-col gap-[12px]">
        {messages.length === 0 && (
          <div className="flex flex-col gap-[14px]">
            <p className="text-[12px] text-[var(--new-table-text)] leading-[1.5]">
              {BRAIN_CONFIGURED
                ? 'Ask the agent to help set up your content brief. It will drive the Studio controls as you answer its questions.'
                : 'Connect the brain (NEXT_PUBLIC_BRAIN_URL) to enable the agent.'}
            </p>

            {BRAIN_CONFIGURED && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-[var(--new-table-text)] mb-[6px]">
                  Capabilities ({capabilities.length})
                </div>
                <div className="flex flex-col gap-[4px]">
                  {capabilities.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-[6px] bg-newBgColorInner px-[10px] py-[6px] border border-[var(--new-table-border)]"
                    >
                      <div className="text-[12px] font-[600] text-btnText">{c.id}</div>
                      <div className="text-[11px] text-[var(--new-table-text)]">{c.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

      {/* Input + Create footer */}
      <div className="p-[12px] border-t border-[var(--new-table-border)] flex flex-col gap-[8px]">
        {/* Create button — gated on brief_complete */}
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
            className="flex-1 min-h-[40px] max-h-[100px] px-[12px] py-[10px] rounded-[8px] bg-newBgColorInner border border-[var(--new-table-border)] text-[13px] text-btnText placeholder:text-[var(--new-table-text)] disabled:opacity-60 resize-none leading-[1.4] overflow-y-auto"
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
