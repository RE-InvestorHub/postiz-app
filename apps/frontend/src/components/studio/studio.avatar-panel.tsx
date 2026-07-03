'use client';

// Avatars tab — a left-rail selection + right-canvas workspace (like Images / Video / Audio). Pick an
// avatar on the left → its canvas opens on the right to develop the lines and cast a talking-head clip.
// One unified inventory of the brand's avatars (synthetic + human), kind-badged. A top action row:
//   • Create — modal wizard: choose Real vs Synthetic, then step through in the modal.
//   • Resume — modal: pick an in-progress real-clone run (draft) or a recorded consent to continue.
//   • Delete — bulk-select mode on the sidebar tiles → remove avatars.
// Postiz design tokens only (dark-mode-first); magenta bg-ai accent for primary actions.

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useStudio, freshAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.store';
import { StudioModal } from '@gitroom/frontend/components/studio/studio.modal';
import { StudioAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.avatar-onboarding';
import { StudioAvatarResumeModal } from '@gitroom/frontend/components/studio/studio.avatar-resume-modal';
import { StudioSynthAvatarOnboarding } from '@gitroom/frontend/components/studio/studio.synthavatar-onboarding';
import { StudioAvatarTile } from '@gitroom/frontend/components/studio/studio.avatar-tile';
import { StudioAvatarCanvas } from '@gitroom/frontend/components/studio/studio.avatar-canvas';
import { listSynthAvatars, listAvatarEngines, deleteSynthAvatar, SynthAvatar, AvatarEngine } from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { listClones, deleteClone } from '@gitroom/frontend/components/studio/studio.clone-client';
import { CloneRecord } from '@gitroom/frontend/components/studio/studio.types';

const IconUserSpark: FC = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 3v4" /><path d="M21 5h-4" />
  </svg>
);

type CreateMode = null | 'choose' | 'synthetic';
type Selected = { kind: 'synthetic' | 'human'; id: string } | null;
const selKey = (kind: 'synthetic' | 'human', id: string) => `${kind}:${id}`;

export const StudioAvatarPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const toaster = useToaster();
  const brandKitId = state.composerBrandKitId || 'default';
  const humanOnboarding = state.avatarOnboarding?.open;

  const [synth, setSynth] = useState<SynthAvatar[] | null>(null);
  const [human, setHuman] = useState<CloneRecord[] | null>(null);
  const [engines, setEngines] = useState<AvatarEngine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>(null);

  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [showResume, setShowResume] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedBulk, setSelectedBulk] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, h] = await Promise.all([
        listSynthAvatars(brandKitId, 'active').catch(() => []),
        listClones().catch(() => []),
      ]);
      setSynth(s); setHuman(h);
    } catch (e) { setError((e as Error)?.message ?? String(e)); setSynth([]); setHuman([]); }
  }, [brandKitId]);

  useEffect(() => { listAvatarEngines().then(setEngines).catch(() => setEngines([])); }, []);
  useEffect(() => { load(); }, [load]);

  // Poll while any human avatar is still training its Soul, so a card flips training → ready on its own.
  const anyTraining = (human || []).some((c) => c.prep_status === 'training');
  useEffect(() => {
    if (!anyTraining) return;
    const t = setInterval(() => { void load(); }, 8000);
    return () => clearInterval(t);
  }, [anyTraining, load]);

  // Agent-driven register/cast/archive fire this event — keep the inventory live.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const on = () => load();
    window.addEventListener('reinvestorhub:synthavatar-refresh', on);
    return () => window.removeEventListener('reinvestorhub:synthavatar-refresh', on);
  }, [load]);

  // Reload when the human onboarding modal closes (a new clone may have started training).
  const prevOnboarding = useRef(false);
  useEffect(() => { if (prevOnboarding.current && !humanOnboarding) load(); prevOnboarding.current = !!humanOnboarding; }, [humanOnboarding, load]);

  const startHuman = () => { setCreateMode(null); dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: freshAvatarOnboarding() }); };
  const closeCreate = useCallback(() => { setCreateMode(null); if (state.avatarOnboarding) dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: null }); }, [state.avatarOnboarding, dispatch]);

  const toggleBulk = (kind: 'synthetic' | 'human', id: string) =>
    setSelectedBulk((prev) => { const next = new Set(prev); const k = selKey(kind, id); next.has(k) ? next.delete(k) : next.add(k); return next; });
  const exitSelect = () => { setSelectMode(false); setSelectedBulk(new Set()); };

  const bulkDelete = async () => {
    if (selectedBulk.size === 0) return;
    const n = selectedBulk.size;
    if (typeof window !== 'undefined' && !window.confirm(`Permanently delete ${n} avatar${n > 1 ? 's' : ''}? Any clips already cast to the Video Library are kept. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await Promise.all([...selectedBulk].map((k) => { const [kind, id] = k.split(/:(.+)/); return kind === 'synthetic' ? deleteSynthAvatar(id) : deleteClone(id); }));
      toaster.show(`Deleted ${n} avatar${n > 1 ? 's' : ''}.`, 'success');
      if (selected && selectedBulk.has(selKey(selected.kind, selected.id))) setSelected(null);
      exitSelect();
      await load();
    } catch (e) { toaster.show((e as Error)?.message ?? 'Delete failed', 'warning'); }
    finally { setDeleting(false); }
  };

  const createOpen = createMode !== null || !!humanOnboarding;
  const modalTitle = createMode === 'synthetic' ? 'New synthetic avatar' : humanOnboarding ? 'New real-person avatar' : 'Create an avatar';
  const modalSubtitle = createMode === 'choose' ? 'Choose the kind of avatar to build.' : undefined;
  const topBtn = 'h-[40px] px-[14px] rounded-[8px] text-[13px] font-[600] flex items-center gap-[7px] transition-opacity';

  const loading = synth == null || human == null;
  const total = (synth?.length || 0) + (human?.length || 0);
  const selectedRecord = selected
    ? (selected.kind === 'human' ? human?.find((c) => c.clone_id === selected.id) : synth?.find((a) => a.synth_id === selected.id))
    : null;
  // Drop a stale selection (e.g. the selected avatar was deleted elsewhere).
  useEffect(() => { if (selected && !loading && !selectedRecord) setSelected(null); }, [selected, loading, selectedRecord]);

  const humanStatus = (c: CloneRecord) =>
    c.prep_status === 'training' ? 'Preparing…' : c.prep_status === 'failed' ? 'Soul failed' : c.visual_identity?.soul_id ? '🔒 Soul-locked' : 'No Soul yet';

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Header + top action row */}
      <div className="flex items-start justify-between gap-[15px] flex-wrap">
        <div className="flex flex-col gap-[4px]">
          <h2 className="text-[15px] font-[600] text-btnText leading-[1.3]">Avatars</h2>
          <p className="text-[13px] text-textItemBlur leading-[1.45] max-w-[540px]">
            Pick an avatar, develop the lines, and cast a talking-head clip. Synthetic avatars are
            brand-owned Soul-locked characters; human avatars are consented clones of a real person.
          </p>
        </div>
        <div className="flex items-center gap-[8px] shrink-0">
          {selectMode ? (
            <>
              <button type="button" disabled={selectedBulk.size === 0 || deleting} onClick={bulkDelete} className={`${topBtn} bg-red-500/90 text-white hover:opacity-90 disabled:opacity-40`}>
                {deleting ? 'Deleting…' : `Delete ${selectedBulk.size || ''}`.trim()}
              </button>
              <button type="button" onClick={exitSelect} className={`${topBtn} bg-btnSimple text-btnText`}>Done</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setCreateMode('choose')} className={`${topBtn} bg-ai text-btnText hover:opacity-90`}><IconUserSpark /> Create</button>
              <button type="button" onClick={() => setShowResume(true)} className={`${topBtn} bg-newBgColorInner border border-newBorder text-btnText hover:border-ai/50`}>Resume</button>
              <button type="button" disabled={total === 0} onClick={() => setSelectMode(true)} className={`${topBtn} bg-newBgColorInner border border-newBorder text-btnText hover:border-red-400/50 disabled:opacity-40`}>Delete</button>
            </>
          )}
        </div>
      </div>

      {error && <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px] text-[13px] text-red-400">Could not load avatars: {error} <button type="button" onClick={load} className="underline text-btnText">Retry</button></div>}

      <div className="flex flex-col md:flex-row gap-[14px]">
        {/* Left rail — selection */}
        <div className="md:w-[300px] shrink-0 flex flex-col gap-[8px]">
          {selectMode && <p className="text-[12px] text-textItemBlur">Select avatars to remove, then hit Delete.</p>}
          {loading ? (
            <div className="text-[13px] text-textItemBlur p-[14px]">Loading your avatars…</div>
          ) : total === 0 ? (
            <div className="flex flex-col items-start gap-[10px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[16px]">
              <p className="text-[13px] text-textItemBlur leading-[1.5]">No avatars yet. Create a synthetic character or clone a real person to get started.</p>
              <button type="button" onClick={() => setCreateMode('choose')} className="h-[38px] px-[16px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] hover:opacity-90">Create an avatar</button>
            </div>
          ) : (
            <div className="flex flex-col gap-[8px] overflow-y-auto max-h-[70vh] pr-[2px]">
              {(synth || []).map((a) => (
                <StudioAvatarTile key={a.synth_id} name={a.name} thumbUrl={a.portrait_url} kind="synthetic" status="🔒 Soul-locked"
                  selected={selected?.kind === 'synthetic' && selected.id === a.synth_id}
                  onClick={() => setSelected({ kind: 'synthetic', id: a.synth_id })}
                  selectMode={selectMode} bulkSelected={selectedBulk.has(selKey('synthetic', a.synth_id))} onToggleBulk={() => toggleBulk('synthetic', a.synth_id)} />
              ))}
              {(human || []).map((c) => (
                <StudioAvatarTile key={c.clone_id} name={c.person} thumbUrl={c.visual_identity?.reference_images?.[0]} kind="human" status={humanStatus(c)}
                  selected={selected?.kind === 'human' && selected.id === c.clone_id}
                  onClick={() => setSelected({ kind: 'human', id: c.clone_id })}
                  selectMode={selectMode} bulkSelected={selectedBulk.has(selKey('human', c.clone_id))} onToggleBulk={() => toggleBulk('human', c.clone_id)} />
              ))}
            </div>
          )}
        </div>

        {/* Right — canvas */}
        <div className="flex-1 min-w-0 rounded-[8px] border border-newBorder bg-newBgColorInner p-[16px]">
          {selectedRecord ? (
            <StudioAvatarCanvas key={selected!.kind + selected!.id} kind={selected!.kind} record={selectedRecord} engines={engines} brandKitId={brandKitId} onChanged={load} />
          ) : (
            <div className="flex items-center justify-center h-full min-h-[280px] text-[13px] text-textItemBlur text-center px-[20px]">
              {total === 0 ? 'Create an avatar to get started.' : 'Select an avatar on the left to script and cast it.'}
            </div>
          )}
        </div>
      </div>

      {/* Create modal — chooser → wizard */}
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
                <span className="text-[12px] text-textItemBlur leading-[1.5]">Clone a real person&apos;s likeness and voice. Requires documented written consent, recorded and attested before the clone is created.</span>
              </button>
            </div>
          )}
          {createMode === 'synthetic' && <StudioSynthAvatarOnboarding brandKitId={brandKitId} onClose={closeCreate} onCreated={() => { closeCreate(); load(); }} />}
          {humanOnboarding && <StudioAvatarOnboarding />}
        </StudioModal>
      )}

      {/* Resume modal */}
      {showResume && <StudioAvatarResumeModal brandKitId={brandKitId} onClose={() => setShowResume(false)} onResumed={() => { setShowResume(false); load(); }} />}
    </div>
  );
};
