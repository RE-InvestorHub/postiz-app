'use client';

import { FC, ReactNode, useState } from 'react';
import clsx from 'clsx';
import { MediaBox } from '@gitroom/frontend/components/media/media.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

/**
 * Studio — a single home for creating content assets (images, video, audio) and
 * editing video. v1 ships the manual-upload path (reuses the existing MediaBox)
 * and stubs the generative surfaces (Higgsfield / Remotion / ElevenLabs) until
 * those services and procurement land. Additive: new files only, no upstream
 * code paths touched besides the one nav entry in top.menu.tsx.
 */

type TabKey = 'images' | 'video' | 'audio' | 'editor';

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
    <path d="M2 10v3" />
    <path d="M6 6v11" />
    <path d="M10 3v18" />
    <path d="M14 8v7" />
    <path d="M18 5v13" />
    <path d="M22 10v3" />
  </svg>
);

const IconEditor: FC = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3Z" />
    <path d="m6.2 5.3 3.1 3.9" />
    <path d="m12.4 3.4 3.1 4" />
    <path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);

const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
  { key: 'images', label: 'Images', icon: <IconImages /> },
  { key: 'video', label: 'Video', icon: <IconVideo /> },
  { key: 'audio', label: 'Audio', icon: <IconAudio /> },
  { key: 'editor', label: 'Video Editor', icon: <IconEditor /> },
];

// A dashed "coming soon" surface for the generative / editor stubs.
const ComingSoon: FC<{ title: string; description: string; via: string }> = ({
  title,
  description,
  via,
}) => (
  <div className="rounded-[8px] border border-dashed border-newBorder bg-newBgColor p-[24px] flex flex-col items-center justify-center text-center gap-[10px] min-h-[220px]">
    <div className="inline-flex items-center gap-[6px] rounded-full bg-ai/15 text-ai px-[10px] py-[4px] text-[12px] font-[600]">
      <span className="w-[6px] h-[6px] rounded-full bg-ai" />
      Coming soon
    </div>
    <div className="text-[16px] font-[600] text-textItemFocused">{title}</div>
    <div className="text-[13px] text-textItemBlur max-w-[420px] leading-[1.5]">
      {description}
    </div>
    <button
      type="button"
      disabled
      className="mt-[6px] h-[40px] px-[18px] rounded-[8px] bg-ai text-white font-[600] opacity-50 cursor-not-allowed"
    >
      {via}
    </button>
  </div>
);

// The disabled "Generate with AI" callout that sits above the manual library.
const GenerateStub: FC<{ kind: string }> = ({ kind }) => (
  <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex items-center gap-[14px]">
    <div className="w-[40px] h-[40px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center shrink-0">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2l1.9 5.7a2 2 0 0 0 1.3 1.3L21 11l-5.8 2a2 2 0 0 0-1.3 1.3L12 20l-1.9-5.7A2 2 0 0 0 8.8 13L3 11l5.8-2a2 2 0 0 0 1.3-1.3L12 2z" />
      </svg>
    </div>
    <div className="flex-1">
      <div className="text-[14px] font-[600] text-textItemFocused">
        Generate {kind} with AI
      </div>
      <div className="text-[12px] text-textItemBlur">
        Higgsfield generation is being wired up — for now, upload your own {kind} below.
      </div>
    </div>
    <button
      type="button"
      disabled
      className="h-[40px] px-[16px] rounded-[8px] bg-ai text-white font-[600] opacity-50 cursor-not-allowed shrink-0"
    >
      Generate
    </button>
  </div>
);

export const Studio: FC = () => {
  const t = useT();
  const [tab, setTab] = useState<TabKey>('images');

  return (
    <div className="bg-newBgColorInner p-[20px] flex flex-1 flex-col gap-[15px] transition-all">
      <div className="flex flex-col gap-[4px]">
        <h1 className="text-[24px] font-[600] text-textItemFocused">
          {t('studio', 'Studio')}
        </h1>
        <p className="text-[13px] text-textItemBlur">
          {t(
            'studio_subtitle',
            'Create and manage your images, video, and audio — all in one place.'
          )}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-[8px] border-b border-newBorder pb-[12px]">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={clsx(
              'flex items-center gap-[8px] h-[40px] px-[14px] rounded-[8px] font-[600] text-[13px] transition-colors',
              tab === item.key
                ? 'bg-boxFocused text-textItemFocused'
                : 'text-textItemBlur hover:bg-boxHover'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'images' && (
        <div className="flex flex-col gap-[15px]">
          <GenerateStub kind="images" />
          <MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
        </div>
      )}

      {tab === 'video' && (
        <div className="flex flex-col gap-[15px]">
          <GenerateStub kind="video" />
          <MediaBox setMedia={() => {}} closeModal={() => {}} standalone={true} />
        </div>
      )}

      {tab === 'audio' && (
        <ComingSoon
          title="Audio generation"
          description="Voiceovers and background audio via ElevenLabs. The generated track will converge into your videos and supply caption timing automatically."
          via="Generate with ElevenLabs"
        />
      )}

      {tab === 'editor' && (
        <ComingSoon
          title="Video editor"
          description="Composite b-roll, overlays, and burned-in captions per platform with the Remotion render service. The editor surface opens here once the service is live."
          via="Open Remotion editor"
        />
      )}
    </div>
  );
};

export default Studio;
