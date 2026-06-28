// SSE streaming client for the Re:InvestorHub workspace brain.
//
// POSTs to NEXT_PUBLIC_BRAIN_URL/agent/stream (or /api/brain/agent/stream if
// the same-origin proxy is in place). Parses the SSE event stream and delivers
// typed events to the caller via callbacks. No React dependency — usable from
// any component or hook.
//
// Event contract (from brain):
//   text           — { token: string }                  incremental streaming text
//   tool_call      — { name: string, input: object }    capability invocation
//   brief_complete — { brief: object }                  all questions answered
//   done           — {}                                 stream ended normally
//   error          — { message: string }                error from brain

export interface BrainTextEvent {
  type: 'text';
  token: string;
}

export interface BrainToolCallEvent {
  type: 'tool_call';
  name: string;
  input: Record<string, unknown>;
}

export interface BrainBriefCompleteEvent {
  type: 'brief_complete';
  brief: Record<string, unknown>;
}

export interface BrainDoneEvent {
  type: 'done';
}

export interface BrainErrorEvent {
  type: 'error';
  message: string;
}

export type BrainEvent =
  | BrainTextEvent
  | BrainToolCallEvent
  | BrainBriefCompleteEvent
  | BrainDoneEvent
  | BrainErrorEvent;

export interface BrainStreamCallbacks {
  onEvent: (event: BrainEvent) => void;
  onAbort?: () => void;
}

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

/**
 * Stream a conversation turn to the brain agent.
 *
 * Returns an AbortController so the caller can cancel mid-stream.
 */
export function streamToBrain(
  message: string,
  conversationId: string | null,
  callbacks: BrainStreamCallbacks,
  brandKitId?: string | null,
  interview?: { kind: string } | null
): AbortController {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(
        `${BRAIN_BASE.replace(/\/+$/, '')}/agent/stream`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
          body: JSON.stringify({ message, conversationId, ...(brandKitId && brandKitId !== 'default' ? { brandKitId } : {}), ...(interview ? { interview } : {}) }),
          signal: controller.signal,
        }
      );

      if (!res.ok || !res.body) {
        callbacks.onEvent({
          type: 'error',
          message: `Brain responded with ${res.status}`,
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      // SSE parser: accumulate lines, fire on blank-line boundaries.
      const flush = (block: string) => {
        const lines = block.split('\n');
        let eventType = 'message';
        let dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        const raw = dataLines.join('\n');
        if (!raw) return;

        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Non-JSON data: treat raw as a text token (covers plain-text SSE).
          callbacks.onEvent({ type: 'text', token: raw });
          return;
        }

        // The brain encodes the event type INSIDE the JSON payload
        // (`data: {"type":"text","text":"…"}`) with no SSE `event:` line, so switch
        // on `parsed.type` first and fall back to the SSE event field.
        const type = String(parsed.type ?? eventType);

        switch (type) {
          case 'text':
            // Brain field is `text`; tolerate `token` too.
            callbacks.onEvent({
              type: 'text',
              token: String(parsed.text ?? parsed.token ?? ''),
            });
            break;
          case 'tool_call':
            callbacks.onEvent({
              type: 'tool_call',
              name: String(parsed.name ?? ''),
              input: (parsed.input as Record<string, unknown>) ?? {},
            });
            break;
          case 'brief_complete':
            callbacks.onEvent({
              type: 'brief_complete',
              brief: (parsed.brief as Record<string, unknown>) ?? {},
            });
            break;
          case 'done':
            callbacks.onEvent({ type: 'done' });
            break;
          case 'error':
            callbacks.onEvent({
              type: 'error',
              message: String(parsed.error ?? parsed.message ?? 'Unknown error'),
            });
            break;
          default:
            // Unknown event type — ignore.
            break;
        }
      };

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline SSE block boundaries.
        const blocks = buffer.split(/\n\n/);
        // Last entry is the incomplete trailing block.
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          if (block.trim()) flush(block);
        }
      }

      // Flush any remaining buffer.
      if (buffer.trim()) flush(buffer);
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        callbacks.onAbort?.();
        return;
      }
      callbacks.onEvent({
        type: 'error',
        message: (err as Error)?.message ?? 'Stream error',
      });
    }
  })();

  return controller;
}
