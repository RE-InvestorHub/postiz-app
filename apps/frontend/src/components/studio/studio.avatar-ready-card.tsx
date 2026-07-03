'use client';

// AvatarReadyCard — the ONE card body shared by synthetic avatars and real-person (human) clones.
// Purely presentational: every handler, confirm, and piece of state stays in the owning gallery
// (studio.synthavatar-gallery / studio.avatar-library) and is passed in. The card only centralizes
// the identical chrome — the select-mode overlay, the header (thumb + name + badges + subheading),
// the model selector + script + Cast panel, and the error line — so both kinds look and behave the
// same. Kind-specific bits (badge, disclosure/consent, voice line, lifecycle actions) are node slots.
//
// Postiz tokens only; the AI accent is the magenta bg-ai (this is an AI feature).

import { FC, ReactNode } from 'react';
import clsx from 'clsx';

export interface AvatarReadyCardProps {
  kind: 'synthetic' | 'human';
  name: string;
  thumbUrl?: string | null;
  /** Kind badge (pink "Synthetic" / blue "Human") + any status pill, rendered next to the name. */
  badges: ReactNode;
  /** The line under the name — e.g. "🔒 Soul-locked · trained M/D/YYYY", a training spinner, or an id. */
  subheading: ReactNode;
  /** Optional extra meta under the subheading (voice label, consent tier, etc). */
  meta?: ReactNode;
  /** Optional block below the header (human: consent summary). */
  beforeCast?: ReactNode;

  /** When true, render the model selector + script + Cast panel. A preparing/failed clone passes false. */
  castable?: boolean;
  engines: { id: string; label: string }[];
  engineValue: string;
  onEngineChange: (id: string) => void;
  engineDisabled?: boolean;
  script: string;
  onScriptChange: (v: string) => void;
  castPlaceholder?: string;
  castDisabled?: boolean;
  casting?: boolean;
  castLabel?: string;      // idle button label (default "Cast into video")
  castingLabel?: string;   // busy button label (default "Generating video…")
  onCast: () => void;
  /** Optional content directly under the cast panel (clip preview / status message). */
  belowCast?: ReactNode;

  error?: string | null;
  /** Kind-specific lifecycle controls (synthetic: voice/reshoot/delete; human: suspend/revoke). */
  actions?: ReactNode;

  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

export const AvatarReadyCard: FC<AvatarReadyCardProps> = ({
  name, thumbUrl, badges, subheading, meta, beforeCast,
  castable, engines, engineValue, onEngineChange, engineDisabled,
  script, onScriptChange, castPlaceholder, castDisabled, casting, castLabel, castingLabel, onCast, belowCast,
  error, actions, selectMode, isSelected, onToggleSelect,
}) => {
  return (
    <div className={clsx('relative flex flex-col gap-[12px] rounded-[8px] border bg-newBgColorInner p-[14px]', selectMode && isSelected ? 'border-ai' : 'border-newBorder')}>
      {selectMode && (
        <button
          type="button"
          onClick={onToggleSelect}
          aria-label={isSelected ? 'Deselect avatar' : 'Select avatar'}
          className={clsx('absolute inset-0 z-10 rounded-[8px] border-2 flex items-start justify-end p-[8px] transition-colors', isSelected ? 'border-ai bg-ai/10' : 'border-transparent bg-black/30 hover:bg-black/20')}
        >
          <span className={clsx('w-[20px] h-[20px] rounded-[6px] border-2 flex items-center justify-center text-[11px] leading-none', isSelected ? 'bg-ai border-ai text-btnText' : 'bg-newBgColor border-newBorder')}>
            {isSelected ? '✓' : ''}
          </span>
        </button>
      )}

      {/* Header — 56px likeness + name + badges + subheading */}
      <div className="flex items-start gap-[12px]">
        <div className="w-[56px] h-[56px] shrink-0 rounded-[8px] bg-newBgColor border border-newBorder overflow-hidden flex items-center justify-center text-textItemBlur text-[11px]">
          {thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt={name} className="w-full h-full object-cover" />
          ) : 'No image'}
        </div>
        <div className="flex flex-col gap-[3px] min-w-0 flex-1">
          <div className="flex items-center gap-[8px]">
            <span className="text-[14px] font-[600] text-btnText truncate">{name}</span>
            {badges}
          </div>
          {subheading}
          {meta}
        </div>
      </div>

      {beforeCast}

      {/* Cast — model selector + script + Cast button (shared by both kinds) */}
      {castable && (
        <div className="flex flex-col gap-[8px] rounded-[8px] border border-newBorder bg-newBgColor p-[10px]">
          <label className="flex items-center gap-[8px] text-[11px] text-textItemBlur">
            <span className="shrink-0">Model</span>
            <select
              value={engineValue}
              disabled={engineDisabled}
              onChange={(e) => onEngineChange(e.target.value)}
              className="flex-1 min-w-0 h-[30px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText disabled:opacity-50"
            >
              {engines.length === 0 && <option value={engineValue}>{engineValue}</option>}
              {engines.map((eng) => <option key={eng.id} value={eng.id}>{eng.label}</option>)}
            </select>
          </label>
          <textarea
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            placeholder={castPlaceholder || 'Type a line for this avatar to say…'}
            rows={2}
            disabled={casting || castDisabled}
            className="w-full min-w-0 rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText p-[10px] resize-y leading-[1.4] disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!script.trim() || casting || castDisabled}
            onClick={onCast}
            className="h-[36px] px-[14px] rounded-[8px] bg-ai text-btnText font-[600] text-[12px] disabled:opacity-50 inline-flex items-center justify-center gap-[7px]"
          >
            {casting && <span className="inline-block w-[12px] h-[12px] rounded-full border-2 border-btnText/40 border-t-btnText animate-spin" aria-hidden="true" />}
            {casting ? (castingLabel || 'Generating video…') : (castLabel || 'Cast into video')}
          </button>
          {belowCast}
        </div>
      )}

      {error && <span className="text-[11px] text-red-400">{error}</span>}

      {actions}
    </div>
  );
};
