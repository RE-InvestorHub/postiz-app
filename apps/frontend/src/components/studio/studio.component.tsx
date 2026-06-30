'use client';

import { FC, ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  StudioProvider,
  useStudio,
} from '@gitroom/frontend/components/studio/studio.store';
import { buildStudioCapabilities } from '@gitroom/frontend/components/studio/studio.capabilities';
import { generateAsset } from '@gitroom/frontend/components/studio/studio.generate';
import { submitStoryboard } from '@gitroom/frontend/components/studio/studio.storyboard-client';
import { StudioAgentPanel } from '@gitroom/frontend/components/studio/studio.agent-panel';
import { FloatingWindow } from '@gitroom/frontend/components/studio/studio.floating-window';
import { StudioDropZone } from '@gitroom/frontend/components/studio/studio.drop-zone';
import { StudioAdAssetShelf } from '@gitroom/frontend/components/studio/studio.ad-asset-shelf';
import { StudioImagesPanel } from '@gitroom/frontend/components/studio/studio.images-panel';
import { StudioVideoEditorNLE } from '@gitroom/frontend/components/studio/studio.video-editor-nle';
import { StudioAvatarPanel } from '@gitroom/frontend/components/studio/studio.avatar-panel';
import { StudioAudioPanel } from '@gitroom/frontend/components/studio/studio.audio-panel';
import { StudioScriptDirector } from '@gitroom/frontend/components/studio/studio.script-director';
import { StudioScriptPanel } from '@gitroom/frontend/components/studio/studio.script-panel';
import { StudioVideoLibraryPanel } from '@gitroom/frontend/components/studio/studio.video-library-panel';
import { StudioStoryboardPanel } from '@gitroom/frontend/components/studio/studio.storyboard-panel';
import { StudioSceneDirector } from '@gitroom/frontend/components/studio/studio.scene-director';
import { StudioProjectBar } from '@gitroom/frontend/components/studio/studio.project-bar';
import { SoulTrainingWatcher } from '@gitroom/frontend/components/studio/studio.soul-watcher';
import { StudioAssetsPanel } from '@gitroom/frontend/components/studio/studio.assets-panel';
import { StudioBrandPanel } from '@gitroom/frontend/components/studio/studio.brand-panel';
import { StudioComposerHub } from '@gitroom/frontend/components/studio/studio.composer-hub';
import {
  StudioTab,
  modelsForKind,
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
const IconProject: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </svg>
);
const IconComposer: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <rect x="3" y="15" width="18" height="6" rx="1" fill="currentColor" stroke="none" opacity="0.5" />
    <path d="M6 7h6" />
  </svg>
);
const IconBrand: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="13.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="10.5" r="2.5" /><circle cx="8.5" cy="7.5" r="2.5" /><circle cx="6.5" cy="12.5" r="2.5" />
    <path d="M12 22a10 10 0 1 1 0-20 6 6 0 0 0 0 12h1.5a2.5 2.5 0 0 1 0 5 2.5 2.5 0 0 0 0 3Z" />
  </svg>
);

const TABS: { key: StudioTab; label: string; icon: ReactNode }[] = [
  { key: 'brand', label: 'Brand', icon: <IconBrand /> },
  { key: 'project', label: 'Assets', icon: <IconProject /> },
  { key: 'images', label: 'Images', icon: <IconImages /> },
  { key: 'video', label: 'Video', icon: <IconVideo /> },
  { key: 'audio', label: 'Audio', icon: <IconAudio /> },
  { key: 'editor', label: 'Video Editor', icon: <IconEditor /> },
  { key: 'avatars', label: 'Avatars', icon: <IconAvatar /> },
  { key: 'composer', label: 'Composer', icon: <IconComposer /> },
];

// Video tab — the Scene Director is the generation ENGINE (above the Library/canvas, matching the
// Images tab). The former three stacked generators (Brief→short · Single clip · Character previs)
// were removed; the Director now drives keyframe / clip / video generation. (Plan 2.)
const VideoTabContent: FC = () => {
  const { state } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';
  const videoModels = modelsForKind('video');
  // Default to the cheapest model (Kling 3.0 Turbo — first in STUDIO_VIDEO_MODELS), not Veo (priciest).
  const [videoModel, setVideoModel] = useState(videoModels[0]?.value ?? 'kling3_0_turbo');
  const [uploadOpen, setUploadOpen] = useState(false);
  // Lower section toggles between the media bin (Library) and the Generated Storyboard (Plan 8).
  const [videoView, setVideoView] = useState<'library' | 'storyboard'>('library');
  const refreshVideo = () => { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:video-refresh')); };
  return (
    <div className="flex flex-col gap-[18px]">
      {/* Scene Director — the Video generation engine: keyframe · clip · gap-fill video (context="video").
          Sits ABOVE the model banner, matching the Images tab. */}
      <StudioSceneDirector brandKitId={brandKitId} context="video" videoModel={videoModel} />

      {/* Model + Upload banner (mirrors the Images tab's banner). Model lives OUTSIDE the Director;
          it drives the Director's Clip + gap-fill Video outputs. */}
      <div className="flex flex-wrap items-center gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[10px]">
        <select value={videoModel} onChange={(e) => setVideoModel(e.target.value)} title="Video model"
          className="h-[40px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText">
          {videoModels.map((m) => (<option key={m.value} value={m.value}>{m.label} ({m.credits})</option>))}
        </select>
        <span className="text-[11px] text-textItemBlur hidden lg:inline">Video model for the Director&apos;s Clip + Video outputs. Gap-fill needs a start→end model (Kling/Seedance).</span>
        <button type="button" onClick={() => setUploadOpen(true)}
          className="ml-auto h-[36px] px-[14px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] hover:opacity-90">⬆ Upload</button>
      </div>

      {/* Lower section: Library (media bin) ⇄ Storyboard (direct the numbered keyframes into a clip). */}
      <div className="flex items-center gap-[8px]">
        <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden">
          {([['library', '▦ Library'], ['storyboard', '🎬 Storyboard']] as const).map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => setVideoView(v)}
              title={v === 'library' ? 'The brand’s clips + keyframe stills' : 'Direct each transition between your numbered keyframes → one clip'}
              className={'h-[34px] px-[14px] text-[12px] font-[600] ' + (videoView === v ? 'bg-ai text-white' : 'text-textItemBlur hover:text-btnText')}>{lbl}</button>
          ))}
        </span>
      </div>

      {/* Library — the brand's clips/shorts + keyframe stills (media-aware canvas). Right-click a
          keyframe to number it; the numbered keyframes (in order) feed the Storyboard. */}
      {videoView === 'library' ? <StudioVideoLibraryPanel /> : <StudioStoryboardPanel brandKitId={brandKitId} videoModel={videoModel} />}

      {/* Upload modal — drop a video into the brand's library (mirrors the Images upload). */}
      {uploadOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-[20px]" onClick={() => setUploadOpen(false)}>
          <div className="w-[560px] max-w-full rounded-[12px] border border-newBorder bg-newBgColor p-[20px] flex flex-col gap-[12px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-[8px]">
              <span className="text-[15px] font-[700] text-btnText flex-1">Upload video to the library</span>
              <button type="button" onClick={() => setUploadOpen(false)} className="h-[28px] w-[28px] rounded-[8px] flex items-center justify-center text-textItemBlur hover:text-btnText">✕</button>
            </div>
            <span className="text-[12px] text-textItemBlur">Drag &amp; drop or browse — MP4 / WEBM / MOV. Added to this brand&apos;s video library.</span>
            <StudioDropZone accept="video" brandKitId={brandKitId} onUploaded={() => { setUploadOpen(false); refreshVideo(); }} />
          </div>
        </div>, document.body)}
    </div>
  );
};

// Audio tab — mirrors the Images/Video skeleton: the Audio Director on top, then a
// [ Library | Script | Mixer ] sub-view toggle (Plan 1). Library = the single-voice VO quick path
// + ad audio + uploads (the minimal media bin); Script = the writer's room; Mixer = Plan 3 (stub).
const AudioTabContent: FC = () => {
  const { state } = useStudio();
  const brandKitId = state.composerBrandKitId || 'default';
  const [view, setView] = useState<'library' | 'script' | 'mixer'>('script');
  return (
    <div className="flex flex-col gap-[18px]">
      <StudioScriptDirector brandKitId={brandKitId} />

      {/* Sub-view toggle — one Audio tab, three views over the same brand audio pool. */}
      <div className="flex items-center gap-[8px]">
        <span className="inline-flex rounded-[8px] border border-newBorder overflow-hidden">
          {([['library', '▦ Library'], ['script', '✍ Script'], ['mixer', '🎚 Mixer']] as const).map(([v, lbl]) => (
            <button key={v} type="button" onClick={() => setView(v)}
              title={v === 'library' ? 'Generated VO + ad audio + uploads' : v === 'script' ? 'The writer’s room — hooks, beats, dialogue' : 'Multi-track mix + SFX (coming in Plan 3)'}
              className={'h-[34px] px-[14px] text-[12px] font-[600] ' + (view === v ? 'bg-ai text-white' : 'text-textItemBlur hover:text-btnText')}>{lbl}</button>
          ))}
        </span>
      </div>

      {view === 'script' && <StudioScriptPanel />}

      {view === 'library' && (
        <div className="flex flex-col gap-[15px]">
          <StudioAudioPanel />
          {/* Audio assets already on the active Ad, cascaded into this tab. */}
          <StudioAdAssetShelf objectType="audio" />
          <div className="flex items-center gap-[10px]">
            <div className="flex-1 h-px bg-newBorder" />
            <span className="text-[11px] font-[500] text-textItemBlur uppercase tracking-[0.06em] shrink-0">or upload your own</span>
            <div className="flex-1 h-px bg-newBorder" />
          </div>
          <StudioDropZone accept="audio" />
        </div>
      )}

      {view === 'mixer' && (
        <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgColor p-[24px] flex flex-col items-center gap-[6px] text-center">
          <span className="text-[14px] font-[600] text-btnText">🎚 Mixer — coming in Plan 3</span>
          <span className="text-[12px] text-textItemBlur max-w-[420px]">Multi-track mixing (Dialogue / SFX / Music), sound effects, music beds with auto-ducking, and a master mix. Built on the same timeline editor as the Video Editor.</span>
        </div>
      )}
    </div>
  );
};

const StudioInner: FC = () => {
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
        <div className="flex items-center justify-end gap-[12px]">
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
        {/* Watches long Soul trainings and notifies on completion from any tab (renders nothing). */}
        <SoulTrainingWatcher />

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

        {state.activeTab === 'images' && (
          <StudioImagesPanel caps={caps} models={modelsForKind('images')} />
        )}
        {state.activeTab === 'video' && <VideoTabContent />}
        {state.activeTab === 'audio' && <AudioTabContent />}
        {state.activeTab === 'editor' && <StudioVideoEditorNLE />}
        {state.activeTab === 'avatars' && <StudioAvatarPanel />}
        {state.activeTab === 'brand' && <StudioBrandPanel />}
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

      {/* Draggable floating agent chat (opened from the Brand tab's logo "Generate with AI") */}
      {state.floatingAgent && (
        <FloatingWindow title="Brand AI Agent" onClose={() => dispatch({ type: 'CLOSE_FLOATING_AGENT' })}>
          <StudioAgentPanel
            floating
            caps={caps}
            initialInput={state.floatingAgent.seed}
            generation={state.floatingAgent.kind ? { kind: state.floatingAgent.kind, brandKitId: state.floatingAgent.brandKitId, slot: state.floatingAgent.slot } : undefined}
            onClose={() => dispatch({ type: 'CLOSE_FLOATING_AGENT' })}
            onCreate={handleCreate}
          />
        </FloatingWindow>
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
