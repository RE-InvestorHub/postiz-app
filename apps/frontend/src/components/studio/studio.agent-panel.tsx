'use client';

// Pop-out AI Agent panel (scaffold).
//
// v1 surfaces the capability registry (what the agent can drive) and a chat
// surface stubbed until the brain connects over SSE (NEXT_PUBLIC_BRAIN_URL).
// The agent operates the SAME `studio.*` capabilities the manual controls use,
// so when wired it visibly moves the levers. Designed to host more namespaces
// (`schedule.*`, `channels.*`, `analytics.*`) later without changing this panel.

import { FC } from 'react';
import {
  Capability,
  listCapabilities,
} from '@gitroom/frontend/components/studio/studio.capabilities';

const brainConfigured =
  !!(typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL);

export const StudioAgentPanel: FC<{
  caps: Record<string, Capability>;
  onClose: () => void;
}> = ({ caps, onClose }) => {
  const capabilities = listCapabilities(caps);

  return (
    <div className="w-[320px] shrink-0 bg-newBgColor border-l border-newBorder flex flex-col h-full">
      <div className="flex items-center justify-between px-[16px] py-[12px] border-b border-newBorder">
        <div className="flex items-center gap-[8px]">
          <span className="w-[8px] h-[8px] rounded-full bg-ai" />
          <span className="text-[14px] font-[600] text-textItemFocused">AI Agent</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-textItemBlur hover:text-textItemFocused text-[18px] leading-none"
          aria-label="Close agent panel"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-[16px] flex flex-col gap-[14px]">
        <p className="text-[12px] text-textItemBlur leading-[1.5]">
          The agent operates the same controls you do. v1 scope: the Studio surface
          (<span className="text-ai font-[600]">studio.*</span>). It is designed to grow to
          scheduling, channels, and analytics.
        </p>

        <div>
          <div className="text-[11px] uppercase tracking-wide text-textItemBlur mb-[6px]">
            Capabilities ({capabilities.length})
          </div>
          <div className="flex flex-col gap-[4px]">
            {capabilities.map((c) => (
              <div
                key={c.id}
                className="rounded-[6px] bg-newBgColorInner px-[10px] py-[6px] border border-newBorder"
              >
                <div className="text-[12px] font-[600] text-textItemFocused">{c.id}</div>
                <div className="text-[11px] text-textItemBlur">{c.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-[12px] border-t border-newBorder">
        {!brainConfigured && (
          <div className="text-[11px] text-textItemBlur mb-[8px]">
            Connect the brain (NEXT_PUBLIC_BRAIN_URL) to chat and let the agent drive these.
          </div>
        )}
        <div className="flex gap-[8px]">
          <input
            type="text"
            disabled
            placeholder={brainConfigured ? 'Ask the agent…' : 'Agent not connected'}
            className="flex-1 h-[40px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-textItemFocused placeholder:text-textItemBlur disabled:opacity-60"
          />
          <button
            type="button"
            disabled
            className="h-[40px] px-[16px] rounded-[8px] bg-ai text-white font-[600] opacity-50 cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};
