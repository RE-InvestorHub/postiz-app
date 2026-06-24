'use client';

// A single chat message in the Studio AI Agent panel.
//
// Renders four variants:
//   user       — user's own message (right-aligned, muted bg)
//   assistant  — streaming or complete assistant text (left-aligned, inner bg)
//   tool_call  — a capability the brain wants to invoke; shows Approve/Edit/Reject
//                when `pending`, and a subtle pill badge when `applied`
//   system     — status notes (error, info)

import { FC, useState } from 'react';

export type MessageRole = 'user' | 'assistant' | 'tool_call' | 'system';

export interface ToolCallDecision {
  onApprove: () => void;
  onReject: () => void;
  /** Called with the edited payload JSON string. */
  onEdit: (editedInput: string) => void;
}

export interface ChatMessageProps {
  id: string;
  role: MessageRole;
  /** For assistant/user/system: the displayed text. */
  text?: string;
  /** Whether the assistant message is still streaming. */
  streaming?: boolean;
  /** For tool_call messages. */
  toolName?: string;
  toolInput?: Record<string, unknown>;
  /** "pending" = awaiting approval, "applied" = already executed. */
  toolStatus?: 'pending' | 'applied' | 'rejected';
  decision?: ToolCallDecision;
}

const IconSpark: FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 2a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.7A2 2 0 0 0 8.8 13L3 11l5.8-2a2 2 0 0 0 1.3-1.3L12 2z" />
  </svg>
);

const IconCheck: FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX: FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconPencil: FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

/** Very lightweight markdown-ish renderer — bold, code, line-breaks. No deps. */
const SimpleMarkdown: FC<{ text: string }> = ({ text }) => {
  // Split on code blocks first, then inline patterns.
  const parts = text.split(/(```[\s\S]*?```|`[^`]+`|\*\*[^*]+\*\*)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const inner = part.slice(3, -3).replace(/^[^\n]*\n/, ''); // strip lang line
          return (
            <pre
              key={i}
              className="mt-[6px] mb-[4px] px-[10px] py-[8px] rounded-[6px] bg-[#111] text-[11px] font-mono text-[#e0e0e0] overflow-x-auto whitespace-pre-wrap"
            >
              {inner}
            </pre>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={i} className="px-[4px] rounded-[4px] bg-[#222] text-ai font-mono text-[11px]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-[600] text-btnText">{part.slice(2, -2)}</strong>;
        }
        // Regular text — honour newlines.
        return (
          <span key={i}>
            {part.split('\n').map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </span>
        );
      })}
    </span>
  );
};

/** Approval/edit controls for a pending tool call. */
const ToolCallApproval: FC<{
  toolName: string;
  toolInput: Record<string, unknown>;
  decision: ToolCallDecision;
}> = ({ toolName, toolInput, decision }) => {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(
    JSON.stringify(toolInput, null, 2)
  );
  const [editError, setEditError] = useState('');

  const handleEdit = () => {
    try {
      JSON.parse(editText); // validate
      setEditError('');
      decision.onEdit(editText);
    } catch {
      setEditError('Invalid JSON — fix it before applying.');
    }
  };

  return (
    <div className="mt-[8px] rounded-[8px] border border-[var(--new-table-border)] bg-newBgColorInner p-[10px] flex flex-col gap-[8px]">
      <div className="flex items-center gap-[6px]">
        <span className="text-ai"><IconSpark /></span>
        <span className="text-[12px] font-[600] text-btnText">Tool: <code className="font-mono text-ai">{toolName}</code></span>
      </div>

      {editing ? (
        <>
          <textarea
            className="w-full h-[80px] p-[8px] rounded-[6px] bg-[#111] border border-[var(--new-table-border)] text-[11px] font-mono text-btnText resize-y"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            aria-label="Edit tool input JSON"
          />
          {editError && <div className="text-[11px] text-red-400">{editError}</div>}
          <div className="flex gap-[6px]">
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center gap-[4px] h-[30px] px-[10px] rounded-[6px] bg-btnPrimary text-white text-[11px] font-[600]"
            >
              <IconCheck /> Apply
            </button>
            <button
              type="button"
              onClick={() => { setEditing(false); setEditError(''); }}
              className="flex items-center gap-[4px] h-[30px] px-[10px] rounded-[6px] bg-btnSimple text-btnText text-[11px]"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <pre className="px-[8px] py-[6px] rounded-[6px] bg-[#111] text-[10px] font-mono text-[#aaa] overflow-x-auto whitespace-pre-wrap max-h-[80px]">
            {JSON.stringify(toolInput, null, 2)}
          </pre>
          <div className="flex gap-[6px]">
            <button
              type="button"
              onClick={decision.onApprove}
              className="flex items-center gap-[4px] h-[30px] px-[10px] rounded-[6px] bg-ai text-white text-[11px] font-[600]"
            >
              <IconCheck /> Approve
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-[4px] h-[30px] px-[10px] rounded-[6px] bg-btnSimple text-btnText text-[11px]"
            >
              <IconPencil /> Edit
            </button>
            <button
              type="button"
              onClick={decision.onReject}
              className="flex items-center gap-[4px] h-[30px] px-[10px] rounded-[6px] bg-btnSimple text-red-400 text-[11px]"
            >
              <IconX /> Reject
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export const ChatMessage: FC<ChatMessageProps> = ({
  role,
  text,
  streaming,
  toolName,
  toolInput,
  toolStatus,
  decision,
}) => {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-[8px] bg-btnSimple px-[12px] py-[8px] text-[13px] text-btnText leading-[1.5]">
          {text}
        </div>
      </div>
    );
  }

  if (role === 'assistant') {
    return (
      <div className="flex gap-[8px] items-start">
        <div className="shrink-0 w-[22px] h-[22px] rounded-full bg-ai/15 text-ai flex items-center justify-center mt-[2px]">
          <IconSpark />
        </div>
        <div className="flex-1 text-[13px] text-btnText leading-[1.6]">
          {text ? <SimpleMarkdown text={text} /> : null}
          {streaming && (
            <span className="inline-block w-[6px] h-[13px] bg-ai ml-[2px] animate-pulse rounded-[2px]" aria-hidden="true" />
          )}
        </div>
      </div>
    );
  }

  if (role === 'tool_call') {
    if (toolStatus === 'applied') {
      return (
        <div className="flex items-center gap-[6px] py-[2px]">
          <span className="w-[16px] h-[16px] rounded-full bg-ai/15 text-ai flex items-center justify-center text-[9px]"><IconCheck /></span>
          <span className="text-[11px] text-[var(--new-table-text)]">
            Applied <code className="font-mono text-ai">{toolName}</code>
          </span>
        </div>
      );
    }

    if (toolStatus === 'rejected') {
      return (
        <div className="flex items-center gap-[6px] py-[2px]">
          <span className="w-[16px] h-[16px] rounded-full bg-btnSimple text-[var(--new-table-text)] flex items-center justify-center text-[9px]"><IconX /></span>
          <span className="text-[11px] text-[var(--new-table-text)]">
            Rejected <code className="font-mono">{toolName}</code>
          </span>
        </div>
      );
    }

    // pending — show approval controls
    if (decision && toolName && toolInput) {
      return (
        <ToolCallApproval
          toolName={toolName}
          toolInput={toolInput}
          decision={decision}
        />
      );
    }

    return null;
  }

  if (role === 'system') {
    return (
      <div className="text-[11px] text-[var(--new-table-text)] italic px-[2px]">
        {text}
      </div>
    );
  }

  return null;
};
