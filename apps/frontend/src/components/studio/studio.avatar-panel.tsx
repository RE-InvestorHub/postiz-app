'use client';

// Avatars tab — one unified inventory of the brand's re-drivable avatars (synthetic + human), each
// card kind-badged (pink "Synthetic" / blue "Human"). A top action row drives everything:
//   • Create — modal wizard: choose Real vs Synthetic, then step through in the modal.
//   • Resume — modal: pick an in-progress real-clone run (draft) or a recorded consent to continue.
//   • Delete — bulk-select mode on the inventory cards → remove avatars.
// Postiz design tokens only (dark-mode-first). AI feature → magenta bg-ai accent for primary actions.

import { FC, useCallback, useState } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  useStudio,
  freshAvatarOnboarding,
} from '@gitroom/frontend/components/studio/studio.store';
import { StudioModal } from '@gitroom/frontend/components/studio/studio.modal';
import { StudioAvatarLibrary } from '@gitroom/frontend/components/studio/studio.avatar-library';
import { StudioAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.avatar-onboarding';
import { StudioAvatarResumeModal } from '@gitroom/frontend/components/studio/studio.avatar-resume-modal';
import { StudioSynthAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.synthavatar-onboarding';
import { StudioSynthAvatarGallery } from '@gitroom/frontend/components/studio/studio.synthavatar-gallery';
import { deleteSynthAvatar } from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { deleteClone } from '@gitroom/frontend/components/studio/studio.clone-client';

const IconUserSpark: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 3v4" /><path d="M21 5h-4" />
  </svg>
);

type CreateMode = null | 'choose' | 'synthetic';

/** key form for a mixed selection across the two avatar kinds. */
const selKey = (kind: 'synthetic' | 'human', id: string) => `${kind}:${id}`;

export const StudioAvatarPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const brandKitId = state.composerBrandKitId || 'default';
  const humanOnboarding = state.avatarOnboarding?.open;

  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [showResume, setShowResume] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [reloadSignal, setReloadSignal] = useState(0);

  const bump = () => setReloadSignal((n) => n + 1);

  const startHuman = () => {
    setCreateMode(null);
    dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: freshAvatarOnboarding() });
  };

  const closeCreate = useCallback(() => {
    setCreateMode(null);
    if (state.avatarOnboarding) dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: null });
  }, [state.avatarOnboarding, dispatch]);

  const toggleSelect = (kind: 'synthetic' | 'human', id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = selKey(kind, id);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    if (typeof window !== 'undefined' && !window.confirm(`Permanently delete ${n} avatar${n > 1 ? 's' : ''}? Any clips already cast and saved to the Video Library are kept. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selected].map((k) => {
        const [kind, id] = k.split(/:(.+)/);
        return kind === 'synthetic' ? deleteSynthAvatar(id) : deleteClone(id);
      }));
      toaster.show(`Deleted ${n} avatar${n > 1 ? 's' : ''}.`, 'success');
      exitSelect();
      bump();
    } catch (e) {
      toaster.show((e as Error)?.message ?? 'Delete failed', 'warning');
    } finally {
      setDeleting(false);
    }
  };

  const createOpen = createMode !== null || !!humanOnboarding;
  const modalTitle = createMode === 'synthetic' ? 'New synthetic avatar' : humanOnboarding ? 'New real-person avatar' : 'Create an avatar';
  const modalSubtitle = createMode === 'choose' ? 'Choose the kind of avatar to build.' : undefined;

  const topBtn = 'h-[40px] px-[14px] rounded-[8px] text-[13px] font-[600] flex items-center gap-[7px] transition-opacity';

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Header + top action row */}
      <div className="flex items-start justify-between gap-[15px] flex-wrap">
        <div className="flex flex-col gap-[4px]">
          <h2 className="text-[15px] font-[600] text-btnText leading-[1.3]">Avatars</h2>
          <p className="text-[13px] text-textItemBlur leading-[1.45] max-w-[540px]">
            Build re-drivable avatars and cast them with a script. Synthetic avatars are brand-owned
            Soul-locked characters; human avatars are consented clones of a real person.
          </p>
        </div>
        <div className="flex items-center gap-[8px] shrink-0">
          {selectMode ? (
            <>
              <button type="button" disabled={selected.size === 0 || deleting} onClick={bulkDelete} className={`${topBtn} bg-red-500/90 text-white hover:opacity-90 disabled:opacity-40`}>
                {deleting ? 'Deleting…' : `Delete ${selected.size || ''}`.trim()}
              </button>
              <button type="button" onClick={exitSelect} className={`${topBtn} bg-btnSimple text-btnText`}>Done</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setCreateMode('choose')} className={`${topBtn} bg-ai text-btnText hover:opacity-90`}>
                <IconUserSpark /> Create
              </button>
              <button type="button" onClick={() => setShowResume(true)} className={`${topBtn} bg-newBgColorInner border border-newBorder text-btnText hover:border-ai/50`}>Resume</button>
              <button type="button" onClick={() => setSelectMode(true)} className={`${topBtn} bg-newBgColorInner border border-newBorder text-btnText hover:border-red-400/50`}>Delete</button>
            </>
          )}
        </div>
      </div>

      {selectMode && (
        <p className="text-[12px] text-textItemBlur">Select the avatars to remove, then hit Delete.</p>
      )}

      {/* Unified inventory — synthetic + human in one grid, no separator, kind-badged. */}
      <div className="flex flex-col gap-[12px]">
        <StudioSynthAvatarGallery
          brandKitId={brandKitId}
          reloadSignal={reloadSignal}
          hideHeading
          selectMode={selectMode}
          isSelected={(id) => selected.has(selKey('synthetic', id))}
          onToggleSelect={(id) => toggleSelect('synthetic', id)}
        />
        <StudioAvatarLibrary
          hideHeading
          reloadSignal={reloadSignal}
          selectMode={selectMode}
          isSelected={(id) => selected.has(selKey('human', id))}
          onToggleSelect={(id) => toggleSelect('human', id)}
        />
      </div>

      {/* Create modal — chooser → wizard, all in one shell. */}
      {createOpen && (
        <StudioModal title={modalTitle} subtitle={modalSubtitle} onClose={closeCreate} width={humanOnboarding || createMode === 'synthetic' ? 640 : 560}>
          {createMode === 'choose' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[12px]">
              <button type="button" onClick={() => setCreateMode('synthetic')} className="flex flex-col items-start gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[16px] text-left hover:border-ai/50 transition-colors">
                <span className="text-[13px] font-[600] text-btnText">Synthetic character</span>
                <span className="text-[12px] text-textItemBlur leading-[1.5]">Turn a brand-owned, Soul-locked character (e.g. Marcus) into a talking avatar. No real person, no consent doc — just a brand-ownership attestation.</span>
              </button>
              <button type="button" onClick={startHuman} className="flex flex-col items-start gap-[6px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[16px] text-left hover:border-ai/50 transition-colors">
                <span className="text-[13px] font-[600] text-btnText">Real person</span>
                <span className="text-[12px] text-textItemBlur leading-[1.5]">Clone a real person's likeness and voice. Requires documented written consent, recorded and attested before the clone is created.</span>
              </button>
            </div>
          )}
          {createMode === 'synthetic' && (
            <StudioSynthAvatarOnboarding brandKitId={brandKitId} onClose={closeCreate} onCreated={() => { closeCreate(); bump(); }} />
          )}
          {humanOnboarding && <StudioAvatarOnboarding />}
        </StudioModal>
      )}

      {/* Resume modal */}
      {showResume && <StudioAvatarResumeModal brandKitId={brandKitId} onClose={() => setShowResume(false)} onResumed={() => setShowResume(false)} />}
    </div>
  );
};
