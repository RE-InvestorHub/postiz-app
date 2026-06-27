'use client';

import { FC, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import {
  StudioProvider,
  useStudio,
} from '@gitroom/frontend/components/studio/studio.store';
import {
  buildStudioCapabilities,
  Capability,
} from '@gitroom/frontend/components/studio/studio.capabilities';
import { generateAsset } from '@gitroom/frontend/components/studio/studio.generate';
import { submitStoryboard } from '@gitroom/frontend/components/studio/studio.storyboard-client';
import { StudioAgentPanel } from '@gitroom/frontend/components/studio/studio.agent-panel';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { RemotionEditorPanel } from '@gitroom/frontend/components/studio/studio.remotion-editor';
import { StudioAvatarPanel } from '@gitroom/frontend/components/studio/studio.avatar-panel';
import { StudioAvatarCast } from '@gitroom/frontend/components/studio/studio.avatar-cast';
import { StudioAudioPanel } from '@gitroom/frontend/components/studio/studio.audio-panel';
import { StudioPrevisPanel } from '@gitroom/frontend/components/studio/studio.previs-panel';
import { StudioProjectBar } from '@gitroom/frontend/components/studio/studio.project-bar';
import { StudioAssetsPanel } from '@gitroom/frontend/components/studio/studio.assets-panel';
import { StudioComposerHub } from '@gitroom/frontend/components/studio/studio.composer-hub';
import { StudioVideoComposerPanel } from '@gitroom/frontend/components/studio/studio.video-composer-panel';
import { addObject } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  StudioTab,
  modelsForKind,
  STUDIO_ASPECT_RATIOS,
  STUDIO_RESOLUTIONS,
} from '@gitroom/frontend/components/studio/studio.types';

/**
 * Studio — content creation hub. Built on a shared state store + a namespaced
 * capability registry (`studio.*`) so BOTH the manual controls below and the
 * pop-out agent operate the exact same levers. Manual upload + image/video
 * generation are wired; audio + video-editor are stubbed pending their services.
 */

// Inline Lucide-style icons (MIT) — currentColor so they theme with the tab.
const IconImages: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);
const IconVideo: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </svg>
);
const IconAudio: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />
  </svg>
);
const IconEditor: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
    <path d="m6.2 5.3 3.1 3.9" /><path d="m12.4 3.4 3.1 4" />
    <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);
const IconAvatar: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
// Labeled section divider — reused across stacked tab sections (e.g. the Video tab).
const SectionDivider: FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-[10px]">
    <div className="flex-1 h-px bg-newBorder" />
    <span className="text-[11px] font-[500] text-textItemBlur uppercase tracking-[0.06em] shrink-0">{label}</span>
    <div className="flex-1 h-px bg-newBorder" />
  </div>
);
const IconProject: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);
const IconSpark: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 2a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.7A2 2 0 0 0 8.8 13L3 11l5.8-2a2 2 0 0 0 1.3-1.3L12 2z" />
  </svg>
);
const IconComposer: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="3" y="15" width="18" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
    <path d="M6 7h6" />
  </svg>
);

const TABS: { key: StudioTab; label: string; icon: ReactNode }[] = [
  { key: 'images', label: 'Images', icon: <IconImages /> },
  { key: 'video', label: 'Video', icon: <IconVideo /> },
  { key: 'audio', label: 'Audio', icon: <IconAudio /> },
  { key: 'editor', label: 'Video Editor', icon: <IconEditor /> },
  { key: 'avatars', label: 'Avatars', icon: <IconAvatar /> },
  { key: 'project', label: 'Assets', icon: <IconProject /> },
  { key: 'composer', label: 'Composer', icon: <IconComposer /> },
];

const selectCls =
  'h-[40px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText';

// The real generation control block (Images / Video), wired to `studio.*` caps.
const GeneratePanel: FC<{ caps: Record<string, Capability>; kind: string }> = ({ caps, kind }) => {
  const { state } = useStudio();
  const generating = state.status === 'generating';
  const tabResults = state.results.filter((r) => r.tab === state.activeTab);
  // "Add to ad" — link a generated asset to the active Ad (project-agnostic ref).
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const addToAd = async (id: string) => {
    if (!state.activeAdId) return;
    try {
      await addObject({ adId: state.activeAdId, type: kind === 'video' ? 'clip' : 'image', id });
      setAddedIds((s) => new Set(s).add(id));
    } catch { /* surfaced elsewhere; keep the grid resilient */ }
  };
  // Image models on the Images tab, video models (Veo/Seedance/Kling/…) on Video.
  const models = modelsForKind(kind);

  // Keep the selected model valid for this tab — when you switch tabs, snap to the
  // tab's first model if the current one belongs to the other kind.
  useEffect(() => {
    if (!models.some((m) => m.value === state.model)) {
      caps['studio.selectModel'].handler({ model: models[0].value });
    }
  }, [kind, state.model, caps, models]);

  return (
    <div className="flex flex-col gap-[15px]">
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <div className="flex items-center gap-[8px]">
          <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center"><IconSpark /></span>
          <span className="text-[14px] font-[600] text-btnText">Generate {kind} with AI</span>
        </div>
        <textarea
          value={state.prompt}
          onChange={(e) => caps['studio.setPrompt'].handler({ prompt: e.target.value })}
          placeholder={`Describe the ${kind} you want…`}
          rows={3}
          className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y"
        />
        <div className="flex flex-wrap gap-[10px] items-center">
          <select value={state.model} onChange={(e) => caps['studio.selectModel'].handler({ model: e.target.value })} className={selectCls}>
            {models.map((m) => (<option key={m.value} value={m.value}>{m.label} ({m.credits})</option>))}
          </select>
          <select value={state.aspectRatio} onChange={(e) => caps['studio.setAspectRatio'].handler({ aspectRatio: e.target.value })} className={selectCls}>
            {STUDIO_ASPECT_RATIOS.map((a) => (<option key={a} value={a}>{a}</option>))}
          </select>
          <select value={state.resolution} onChange={(e) => caps['studio.setResolution'].handler({ resolution: e.target.value })} className={selectCls}>
            {STUDIO_RESOLUTIONS.map((r) => (<option key={r} value={r}>{r.toUpperCase()}</option>))}
          </select>
          <button
            type="button"
            disabled={generating}
            onClick={() => caps['studio.generate'].handler()}
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
          >
            {generating ? 'Generating…' : 'Generate'}
          </button>
        </div>
        {state.status === 'error' && state.error && (
          <div className="text-[12px] text-red-400">{state.error}</div>
        )}
      </div>

      {/* Casting: drive a registered avatar into a video (Video tab only). */}
      {kind === 'video' && <StudioAvatarCast />}

      {tabResults.length > 0 && (
        <div className="grid grid-cols-2 minCustom:grid-cols-3 gap-[10px]">
          {tabResults.map((r) => (
            <div key={r.id} className="rounded-[8px] overflow-hidden border border-newBorder flex flex-col">
              <a href={r.url} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt={r.prompt.slice(0, 60)} className="w-full h-auto" />
              </a>
              <button
                type="button"
                disabled={!state.activeAdId || addedIds.has(r.id)}
                onClick={() => addToAd(r.id)}
                className="h-[30px] text-[12px] font-[600] text-btnText bg-btnPrimary disabled:opacity-50"
                title={state.activeAdId ? 'Add this asset to the active ad' : 'Select a campaign + ad first'}
              >
                {addedIds.has(r.id) ? 'Added ✓' : '+ Add to ad'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Divider between AI generation results and the user-upload zone */}
      <div className="flex items-center gap-[10px]">
        <div className="flex-1 h-px bg-newBorder" />
        <span className="text-[11px] font-[500] text-textItemBlur uppercase tracking-[0.06em] shrink-0">
          or upload your own
        </span>
        <div className="flex-1 h-px bg-newBorder" />
      </div>

      <StudioDropZone accept={kind === 'video' ? 'video' : 'image'} />
    </div>
  );
};

const StudioInner: FC = () => {
  const t = useT();
  const { state, dispatch } = useStudio();
  const [agentOpen, setAgentOpen] = useState(false);
  // Storyboard submission feedback: null = idle, string = message to show.
  const [storyboardMsg, setStoryboardMsg] = useState<string | null>(null);

  // getState via ref so capability handlers always read the latest state.
  const stateRef = useRef(state);
  stateRef.current = state;

  const caps = useMemo(
    () =>
      buildStudioCapabilities({
        dispatch,
        getState: () => stateRef.current,
        generate: generateAsset,
      }),
    [dispatch]
  );

  // onCreate — fired when the agent panel's Create button is clicked with a
  // completed brief. Submits the brief + current slot snapshot to the
  // storyboard service. Safe when the service isn't up yet (404 is caught and
  // surfaced as a message, not a crash).
  const handleCreate = useCallback(
    async (brief: Record<string, unknown>) => {
      setStoryboardMsg('Submitting to storyboard service…');
      const result = await submitStoryboard({
        brief,
        slots: stateRef.current.slots,
      });
      setStoryboardMsg(result.message);
      // Auto-clear success messages after 6 s; errors stay until dismissed.
      if (result.ok) {
        setTimeout(() => setStoryboardMsg(null), 6000);
      }
    },
    []
  );

  return (
    <div className="bg-newBgColorInner flex flex-1 h-full transition-all">
      <div className="flex flex-1 flex-col gap-[15px] p-[20px] overflow-y-auto">
        <div className="flex items-start justify-between gap-[12px]">
          <div className="flex flex-col gap-[4px]">
            <h1 className="text-[24px] font-[600] text-btnText">{t('studio', 'Studio')}</h1>
            <p className="text-[13px] text-textItemBlur">
              {t('studio_subtitle', 'Create and manage your images, video, and audio — all in one place.')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAgentOpen((v) => !v)}
            className={clsx(
              'flex items-center gap-[8px] h-[40px] px-[14px] rounded-[8px] font-[600] text-[13px] transition-colors shrink-0',
              agentOpen ? 'bg-ai text-white' : 'bg-ai/15 text-ai hover:bg-ai/25'
            )}
          >
            <span className="w-[7px] h-[7px] rounded-full bg-current" />
            AI Agent
          </button>
        </div>

        {/* Storyboard submission status toast */}
        {storyboardMsg && (
          <div className="flex items-center justify-between gap-[10px] rounded-[8px] border border-[var(--new-table-border)] bg-newBgColor px-[14px] py-[10px] text-[13px]">
            <span className="text-btnText leading-[1.4]">{storyboardMsg}</span>
            <button
              type="button"
              onClick={() => setStoryboardMsg(null)}
              className="shrink-0 text-[var(--new-table-text)] hover:text-btnText text-[16px] leading-none"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        )}

        {/* Active Campaign + Ad context, shared across every tab. */}
        <StudioProjectBar />

        <div className="flex flex-wrap gap-[8px] border-b border-newBorder pb-[12px]">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => caps['studio.setTab'].handler({ tab: item.key })}
              className={clsx(
                'flex items-center gap-[8px] h-[40px] px-[14px] rounded-[8px] font-[600] text-[13px] transition-colors',
                state.activeTab === item.key ? 'bg-boxFocused text-textItemFocused' : 'text-textItemBlur hover:bg-boxHover'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        {state.activeTab === 'images' && <GeneratePanel caps={caps} kind="images" />}
        {state.activeTab === 'video' && (
          <div className="flex flex-col gap-[18px]">
            {/* Video composer — brief → clips → review → assemble (the Storyboard tab folded in here) */}
            <StudioVideoComposerPanel />
            <SectionDivider label="or generate a single clip" />
            <GeneratePanel caps={caps} kind="video" />
            <SectionDivider label="character previs — capture & restage" />
            <StudioPrevisPanel />
          </div>
        )}
        {state.activeTab === 'audio' && (
          <div className="flex flex-col gap-[15px]">
            <StudioAudioPanel />
            <div className="flex items-center gap-[10px]">
              <div className="flex-1 h-px bg-newBorder" />
              <span className="text-[11px] font-[500] text-textItemBlur uppercase tracking-[0.06em] shrink-0">
                or upload your own
              </span>
              <div className="flex-1 h-px bg-newBorder" />
            </div>
            <StudioDropZone accept="audio" />
          </div>
        )}
        {state.activeTab === 'editor' && (
          <RemotionEditorPanel />
        )}
        {state.activeTab === 'avatars' && <StudioAvatarPanel />}
        {state.activeTab === 'project' && <StudioAssetsPanel />}
        {state.activeTab === 'composer' && <StudioComposerHub />}
      </div>

      {agentOpen && (
        <StudioAgentPanel
          caps={caps}
          onClose={() => setAgentOpen(false)}
          onCreate={handleCreate}
        />
      )}
    </div>
  );
};

export const Studio: FC = () => (
  <StudioProvider>
    <StudioInner />
  </StudioProvider>
);

export default Studio;
