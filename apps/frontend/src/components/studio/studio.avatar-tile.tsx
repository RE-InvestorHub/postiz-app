'use client';

// Avatar tile — a compact, selectable row in the Avatars sidebar (portrait + name + kind badge +
// status). Click selects it → its canvas opens on the right. In bulk-Delete mode a checkbox overlay
// replaces click-to-open. Cast/lifecycle controls live in the canvas, not here.
//
// Postiz tokens only; pink Synthetic / blue Human badge, magenta bg-ai selection accent.

import { FC } from 'react';
import clsx from 'clsx';

export const StudioAvatarTile: FC<{
  name: string;
  thumbUrl?: string | null;
  kind: 'synthetic' | 'human';
  status?: string;
  selected?: boolean;
  onClick?: () => void;
  selectMode?: boolean;
  bulkSelected?: boolean;
  onToggleBulk?: () => void;
}> = ({ name, thumbUrl, kind, status, selected, onClick, selectMode, bulkSelected, onToggleBulk }) => {
  const isHuman = kind === 'human';
  return (
    <button
      type="button"
      onClick={selectMode ? onToggleBulk : onClick}
      aria-pressed={selectMode ? bulkSelected : selected}
      className={clsx(
        'relative flex items-center gap-[10px] rounded-[8px] border p-[8px] text-left transition-colors w-full',
        selectMode
          ? (bulkSelected ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColor hover:border-ai/40')
          : (selected ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColor hover:border-ai/40'),
      )}
    >
      <span className="w-[40px] h-[40px] shrink-0 rounded-[6px] bg-newBgColorInner border border-newBorder overflow-hidden flex items-center justify-center text-textItemBlur text-[9px]">
        {thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbUrl} alt={name} className="w-full h-full object-cover" />
        ) : '—'}
      </span>
      <span className="flex flex-col gap-[2px] min-w-0 flex-1">
        <span className="text-[13px] font-[600] text-btnText truncate">{name}</span>
        <span className="flex items-center gap-[6px]">
          <span className={clsx('shrink-0 px-[6px] py-[1px] rounded-[5px] text-[9px] font-[600] uppercase tracking-[0.04em]', isHuman ? 'bg-blue-500 text-white' : 'bg-ai text-btnText')}>
            {isHuman ? 'Human' : 'Synthetic'}
          </span>
          {status && <span className="text-[10px] text-textItemBlur truncate">{status}</span>}
        </span>
      </span>
      {selectMode && (
        <span className={clsx('w-[18px] h-[18px] shrink-0 rounded-[5px] border-2 flex items-center justify-center text-[10px] leading-none', bulkSelected ? 'bg-ai border-ai text-btnText' : 'bg-newBgColorInner border-newBorder')}>
          {bulkSelected ? '✓' : ''}
        </span>
      )}
    </button>
  );
};
