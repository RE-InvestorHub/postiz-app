'use client';

// Composer hub — the Composer tab's deliverable-kind switch. The Composer produces
// different deliverables from the same Project/Ad: Still post · Carousel · Email.
// (Video ads live in the Video tab.) Each kind is its own panel; all share the
// active Campaign/Ad + Brand Kit. Postiz tokens.

import { FC, useState } from 'react';
import { StudioComposerPanel } from '@gitroom/frontend/components/studio/studio.composer-panel';
import { StudioCarouselPanel } from '@gitroom/frontend/components/studio/studio.carousel-panel';
import { StudioEmailPanel } from '@gitroom/frontend/components/studio/studio.email-panel';

type Kind = 'still' | 'carousel' | 'email';
const KINDS: { key: Kind; label: string }[] = [
  { key: 'still', label: 'Still post' },
  { key: 'carousel', label: 'Carousel' },
  { key: 'email', label: 'Email' },
];

export const StudioComposerHub: FC = () => {
  const [kind, setKind] = useState<Kind>('still');
  return (
    <div className="flex flex-col gap-[15px]">
      <div className="flex items-center gap-[6px]">
        {KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => setKind(k.key)}
            className={`h-[34px] px-[14px] rounded-[8px] text-[13px] font-[600] border ${kind === k.key ? 'bg-boxFocused text-textItemFocused border-newBorder' : 'text-textItemBlur border-transparent hover:bg-boxHover'}`}>
            {k.label}
          </button>
        ))}
      </div>
      {kind === 'still' && <StudioComposerPanel />}
      {kind === 'carousel' && <StudioCarouselPanel />}
      {kind === 'email' && <StudioEmailPanel />}
    </div>
  );
};
