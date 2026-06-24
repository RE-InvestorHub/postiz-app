'use client';

// Completeness meter — shown once the brain starts asking questions.
// Renders a "7 of 11" progress bar using Postiz design tokens.
// Appears only when at least one question has been answered (answered > 0).

import { FC } from 'react';

export interface CompletenessMeterProps {
  answered: number;
  total: number;
}

export const CompletenessMeter: FC<CompletenessMeterProps> = ({
  answered,
  total,
}) => {
  if (total === 0 || answered === 0) return null;

  const pct = Math.min(100, Math.round((answered / total) * 100));
  const complete = answered >= total;

  return (
    <div className="flex flex-col gap-[6px] px-[2px]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[var(--new-table-text)]">
          Brief completeness
        </span>
        <span
          className={`text-[11px] font-[600] ${complete ? 'text-ai' : 'text-btnText'}`}
        >
          {answered} of {total}
        </span>
      </div>

      {/* Track */}
      <div className="h-[4px] w-full rounded-full bg-btnSimple overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            complete ? 'bg-ai' : 'bg-btnPrimary'
          }`}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={answered}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label={`Brief ${answered} of ${total} questions answered`}
        />
      </div>

      {complete && (
        <p className="text-[11px] text-ai font-[500]">
          All questions answered — Create is ready.
        </p>
      )}
    </div>
  );
};
