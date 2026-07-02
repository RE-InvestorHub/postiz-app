'use client';

// Avatars tab — the brand's re-drivable talking avatars. Two kinds share one home:
//   • Synthetic — a brand-owned, Soul-locked character (e.g. Marcus) cast as a talking-head. No real
//     person → a brand-ownership attestation replaces consent. (studio.synthavatar-*)
//   • Human — a re-drivable clone of a real person (likeness + voice), consent-gated. (studio.avatar-*)
//
// One "Create an avatar" entry branches to either kind; below it, a gallery of the brand's avatars.
// Postiz design tokens only (dark-mode-first). AI feature → magenta bg-ai accent for primary actions.

import { FC, useState } from 'react';
import {
  useStudio,
  freshAvatarOnboarding,
} from '@gitroom/frontend/components/studio/studio.store';
import { StudioAvatarLibrary } from '@gitroom/frontend/components/studio/studio.avatar-library';
import { StudioAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.avatar-onboarding';
import { StudioSynthAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.synthavatar-onboarding';
import { StudioSynthAvatarGallery } from '@gitroom/frontend/components/studio/studio.synthavatar-gallery';

const IconUserSpark: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 3v4" /><path d="M21 5h-4" />
  </svg>
);

type CreateMode = null | 'choose' | 'synthetic';

export const StudioAvatarPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';
  const humanOnboarding = state.avatarOnboarding?.open;

  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [reloadSignal, setReloadSignal] = useState(0);

  const startHuman = () => {
    setCreateMode(null);
    dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: freshAvatarOnboarding() });
  };

  const creating = createMode !== null || humanOnboarding;

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-[15px]">
        <div className="flex flex-col gap-[4px]">
          <h2 className="text-[15px] font-[600] text-btnText leading-[1.3]">Avatars</h2>
          <p className="text-[13px] text-textItemBlur leading-[1.45] max-w-[540px]">
            Build re-drivable avatars and cast them with a script. Synthetic avatars are brand-owned
            Soul-locked characters; human avatars are consented clones of a real person.
          </p>
        </div>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreateMode('choose')}
            className="shrink-0 flex items-center gap-[8px] h-[44px] px-[16px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] hover:opacity-90 transition-opacity"
          >
            <IconUserSpark />
            Create an avatar
          </button>
        )}
      </div>

      {/* Create: type chooser */}
      {createMode === 'choose' && (
        <div className="flex flex-col gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[18px]">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-[600] text-btnText">What kind of avatar?</h3>
            <button type="button" onClick={() => setCreateMode(null)} className="h-[32px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[12px]">Cancel</button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
            <button
              type="button"
              onClick={() => setCreateMode('synthetic')}
              className="flex flex-col items-start gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor p-[16px] text-left hover:border-ai/50 transition-colors"
            >
              <span className="text-[13px] font-[600] text-btnText">Synthetic character</span>
              <span className="text-[12px] text-textItemBlur leading-[1.5]">
                Turn a brand-owned, Soul-locked character (e.g. Marcus) into a talking avatar. No real
                person, no consent doc — just a brand-ownership attestation.
              </span>
            </button>
            <button
              type="button"
              onClick={startHuman}
              className="flex flex-col items-start gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor p-[16px] text-left hover:border-ai/50 transition-colors"
            >
              <span className="text-[13px] font-[600] text-btnText">Real person</span>
              <span className="text-[12px] text-textItemBlur leading-[1.5]">
                Clone a real person's likeness and voice. Requires documented written consent, recorded
                and attested before the clone is created.
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Create: synthetic wizard */}
      {createMode === 'synthetic' && (
        <StudioSynthAvatarOnboarding
          brandKitId={brandKitId}
          onClose={() => setCreateMode(null)}
          onCreated={() => { setCreateMode(null); setReloadSignal((n) => n + 1); }}
        />
      )}

      {/* Create: human wizard (existing consent flow) */}
      {humanOnboarding && <StudioAvatarOnboarding />}

      {/* Galleries */}
      {!creating && (
        <div className="flex flex-col gap-[18px]">
          <StudioSynthAvatarGallery brandKitId={brandKitId} reloadSignal={reloadSignal} />
          <StudioAvatarLibrary />
        </div>
      )}
    </div>
  );
};
