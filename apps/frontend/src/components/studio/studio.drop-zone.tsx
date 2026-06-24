'use client';

// StudioDropZone — drag-and-drop upload zone for the Studio page.
//
// Accepts image / video / audio files. Each file is uploaded to the workspace
// brain (POST /studio/upload or the chunked variant for large files) via
// studio.upload-client.ts. On success the asset is dispatched into the Studio
// store (ADD_UPLOAD) and appears in the "Your media" shelf below the zone.
//
// Design: Postiz tokens only — dark-mode-first, magenta AI accent (bg-ai) for
// the active/hover state, newBgColor surfaces, newBorder borders.
// No new npm deps — native DragEvent + fetch only.

import {
  FC,
  DragEvent,
  ChangeEvent,
  useCallback,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import {
  UploadEntry,
  UploadedAsset,
} from '@gitroom/frontend/components/studio/studio.types';

// ---------------------------------------------------------------------------
// Accepted MIME types per kind
// ---------------------------------------------------------------------------
const ACCEPTED_MIME: Record<string, string> = {
  // Images
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/svg+xml': 'image',
  'image/avif': 'image',
  // Video
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-msvideo': 'video',
  'video/x-matroska': 'video',
  // Audio
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/aac': 'audio',
  'audio/mp4': 'audio',
  'audio/flac': 'audio',
  'audio/x-flac': 'audio',
};

const ACCEPT_ATTR = Object.keys(ACCEPTED_MIME).join(',');

function isAccepted(file: File): boolean {
  return file.type in ACCEPTED_MIME;
}

// ---------------------------------------------------------------------------
// Inline icons (Lucide-style, currentColor)
// ---------------------------------------------------------------------------
const IconUpload: FC = () => (
  <svg
    width="28"
    height="28"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconImage: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </svg>
);

const IconVideo: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.934a.5.5 0 0 0-.777-.416L16 11" />
    <rect x="2" y="6" width="14" height="12" rx="2" />
  </svg>
);

const IconAudio: FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M2 10v3" />
    <path d="M6 6v11" />
    <path d="M10 3v18" />
    <path d="M14 8v7" />
    <path d="M18 5v13" />
    <path d="M22 10v3" />
  </svg>
);

const IconCheck: FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconX: FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ---------------------------------------------------------------------------
// Kind icon helper
// ---------------------------------------------------------------------------
function KindIcon({ kind }: { kind: UploadedAsset['kind'] }) {
  if (kind === 'video') return <IconVideo />;
  if (kind === 'audio') return <IconAudio />;
  return <IconImage />;
}

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
const ProgressBar: FC<{ pct: number }> = ({ pct }) => (
  <div className="h-[3px] w-full rounded-full bg-newBorder overflow-hidden">
    <div
      className="h-full rounded-full bg-ai transition-all duration-150"
      style={{ width: `${pct}%` }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Single upload row in the queue
// ---------------------------------------------------------------------------
const UploadRow: FC<{ entry: UploadEntry }> = ({ entry }) => {
  const isDone = entry.status === 'done';
  const isErr = entry.status === 'error';

  return (
    <div className="flex flex-col gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[10px]">
      <div className="flex items-center justify-between gap-[8px]">
        <span className="truncate text-[12px] text-btnText leading-[1.4] flex-1 min-w-0">
          {entry.file.name}
        </span>
        {isDone && (
          <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-[#1db97a]/20 text-[#1db97a] flex items-center justify-center">
            <IconCheck />
          </span>
        )}
        {isErr && (
          <span className="shrink-0 w-[18px] h-[18px] rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
            <IconX />
          </span>
        )}
      </div>
      {entry.status === 'uploading' && <ProgressBar pct={entry.progress} />}
      {isErr && (
        <span className="text-[11px] text-red-400 leading-[1.4]">{entry.error}</span>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Uploaded asset thumbnail card
// ---------------------------------------------------------------------------
const AssetCard: FC<{ asset: UploadedAsset }> = ({ asset }) => (
  <a
    href={asset.url}
    target="_blank"
    rel="noreferrer"
    title={asset.filename}
    className="group relative flex flex-col gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor overflow-hidden hover:border-ai/60 transition-colors"
  >
    {asset.kind === 'image' ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={asset.url}
        alt={asset.filename}
        className="w-full aspect-square object-cover"
      />
    ) : (
      <div className="w-full aspect-square bg-newBgColorInner flex items-center justify-center text-textItemBlur">
        <KindIcon kind={asset.kind} />
      </div>
    )}
    <div className="px-[8px] pb-[8px] flex items-center gap-[5px]">
      <span className="text-textItemBlur shrink-0">
        <KindIcon kind={asset.kind} />
      </span>
      <span className="truncate text-[11px] text-textItemBlur leading-[1.3]">
        {asset.filename}
      </span>
    </div>
  </a>
);

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export interface StudioDropZoneProps {
  /** Filter to one kind — when omitted all kinds are accepted. */
  accept?: UploadedAsset['kind'];
}

export const StudioDropZone: FC<StudioDropZoneProps> = ({ accept }) => {
  const { state, dispatch } = useStudio();
  const [dragging, setDragging] = useState(false);
  const [queue, setQueue] = useState<UploadEntry[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Counter to ignore stale drag-leave events that fire when entering a child.
  const dragCounterRef = useRef(0);

  // Filtered asset shelf — only show assets matching `accept` if provided.
  const shelfAssets = accept
    ? state.uploadedAssets.filter((a) => a.kind === accept)
    : state.uploadedAssets;

  // Accepted MIME for this instance.
  const acceptAttr = accept
    ? Object.entries(ACCEPTED_MIME)
        .filter(([, k]) => k === accept)
        .map(([mime]) => mime)
        .join(',')
    : ACCEPT_ATTR;

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const arr = Array.from(files);
      const filtered = arr.filter((f) => {
        if (!isAccepted(f)) return false;
        if (accept && ACCEPTED_MIME[f.type] !== accept) return false;
        return true;
      });

      if (filtered.length === 0) return;

      // Register all files in the queue before uploading so the UI updates
      // immediately with an "uploading" row for each.
      const entries: UploadEntry[] = filtered.map((file) => ({
        localId: `local_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        progress: 0,
        status: 'uploading',
      }));

      setQueue((prev) => [...entries, ...prev]);

      // Upload each file independently so they can progress in parallel.
      entries.forEach((entry) => {
        uploadFileToBrain(entry.file, (pct) => {
          setQueue((prev) =>
            prev.map((e) =>
              e.localId === entry.localId ? { ...e, progress: pct } : e
            )
          );
        })
          .then((asset) => {
            setQueue((prev) =>
              prev.map((e) =>
                e.localId === entry.localId
                  ? { ...e, status: 'done', progress: 100, asset }
                  : e
              )
            );
            dispatch({ type: 'ADD_UPLOAD', asset });
          })
          .catch((err: unknown) => {
            setQueue((prev) =>
              prev.map((e) =>
                e.localId === entry.localId
                  ? {
                      ...e,
                      status: 'error',
                      error:
                        err instanceof Error
                          ? err.message
                          : 'Upload failed.',
                    }
                  : e
              )
            );
          });
      });
    },
    [accept, dispatch]
  );

  // ---------------------------------------------------------------------------
  // Drag handlers — counter technique avoids flicker when mouse enters children.
  // ---------------------------------------------------------------------------
  const onDragEnter = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    setDragging(true);
  }, []);

  const onDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setDragging(false);
  }, []);

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragging(false);
      if (e.dataTransfer.files?.length) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles]
  );

  const onInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        processFiles(e.target.files);
        // Reset value so re-selecting the same file fires the event again.
        e.target.value = '';
      }
    },
    [processFiles]
  );

  const activeUploads = queue.filter((e) => e.status === 'uploading');

  return (
    <div className="flex flex-col gap-[15px]">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop media files here or click to browse"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        className={clsx(
          'relative flex flex-col items-center justify-center gap-[10px] rounded-[8px] border-2 border-dashed px-[24px] py-[36px] cursor-pointer select-none transition-colors text-center',
          dragging
            ? 'border-ai bg-ai/10 text-ai'
            : 'border-newBorder bg-newBgColor text-textItemBlur hover:border-ai/50 hover:text-ai/80'
        )}
      >
        <span
          className={clsx(
            'w-[48px] h-[48px] rounded-[12px] flex items-center justify-center transition-colors',
            dragging ? 'bg-ai/20 text-ai' : 'bg-newBgColorInner text-textItemBlur'
          )}
        >
          <IconUpload />
        </span>

        <div className="flex flex-col gap-[4px]">
          <span className="text-[14px] font-[600] text-btnText">
            {dragging ? 'Drop to upload' : 'Drag & drop your media here'}
          </span>
          <span className="text-[12px] leading-[1.5]">
            or{' '}
            <span className="text-ai font-[500]">browse files</span>
            {' '}— images, video, and audio accepted
          </span>
        </div>

        {activeUploads.length > 0 && (
          <div className="absolute bottom-[10px] right-[14px] text-[11px] text-textItemBlur">
            {activeUploads.length} uploading…
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptAttr}
        className="sr-only"
        onChange={onInputChange}
        aria-hidden="true"
      />

      {/* Upload queue — only show rows that are in progress or errored */}
      {queue.filter((e) => e.status !== 'done').length > 0 && (
        <div className="flex flex-col gap-[6px]">
          {queue
            .filter((e) => e.status !== 'done')
            .map((entry) => (
              <UploadRow key={entry.localId} entry={entry} />
            ))}
        </div>
      )}

      {/* Uploaded assets shelf */}
      {shelfAssets.length > 0 && (
        <div className="flex flex-col gap-[10px]">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-[600] text-btnText">Your media</span>
            <span className="text-[11px] text-textItemBlur">
              {shelfAssets.length} file{shelfAssets.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-3 minCustom:grid-cols-4 gap-[10px]">
            {shelfAssets.map((asset) => (
              <AssetCard key={asset.assetId} asset={asset} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioDropZone;
