'use client';

// Avatars tab — manage re-drivable AI clones of real people (visual likeness +
// voice). Shell for the clone library (atom 4) and the consent onboarding wizard
// (atom 5). An avatar is a SOURCE that feeds the existing per-shot pipeline; this
// tab is the identity library + consent surface, not a separate generation engine.
//
// Postiz design tokens only (dark-mode-first). This is an AI feature → the magenta
// `bg-ai` accent for the primary action.

import { FC } from 'react';
import {
  useStudio,
  freshAvatarOnboarding,
} from '@gitroom/frontend/components/studio/studio.store';
import { StudioAvatarLibrary } from '@gitroom/frontend/components/studio/studio.avatar-library';

const IconUserSpark: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 3v4" /><path d="M21 5h-4" />
  </svg>
);

export const StudioAvatarPanel: FC = () => {
  const { dispatch } = useStudio();

  const openOnboarding = () =>
    dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: freshAvatarOnboarding() });

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-[15px]">
        <div className="flex flex-col gap-[4px]">
          <h2 className="text-[15px] font-[600] text-btnText leading-[1.3]">Avatars</h2>
          <p className="text-[13px] text-textItemBlur leading-[1.45] max-w-[520px]">
            Build re-drivable AI clones of a real person (likeness + voice) and reuse them
            across commercials. Consent is required before a clone can be created or driven.
          </p>
        </div>
        <button
          type="button"
          onClick={openOnboarding}
          className="shrink-0 flex items-center gap-[8px] h-[44px] px-[16px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] hover:opacity-90 transition-opacity"
        >
          <IconUserSpark />
          New avatar
        </button>
      </div>

      {/* Library — card grid over the brain clone registry. */}
      <StudioAvatarLibrary />
    </div>
  );
};
