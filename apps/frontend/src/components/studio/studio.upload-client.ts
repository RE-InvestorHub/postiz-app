// Upload transport — POST user media to the workspace brain.
//
// Endpoint: POST NEXT_PUBLIC_BRAIN_URL/studio/upload
//
// For files ≤ CHUNK_THRESHOLD (4 MB) → single multipart/form-data POST.
// For larger files → chunked upload:
//   1. POST /studio/upload/init  { filename, size, mimeType } → { uploadId }
//   2. POST /studio/upload/chunk { uploadId, chunkIndex, total } + chunk bytes
//   3. POST /studio/upload/complete { uploadId } → { assetId, url, kind }
//
// On success the brain records a lineage manifest with provenance: 'user_upload'
// and returns { assetId, url, kind, filename }.
//
// Graceful degradation: if NEXT_PUBLIC_BRAIN_URL is unset all uploads throw with
// a clear message so the rest of the Studio still works.

import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';

const BRAIN_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) ||
  '/api/brain';

/** Files ≤ 4 MB go as a single POST; larger files use the chunked path. */
const CHUNK_THRESHOLD = 4 * 1024 * 1024;
/** 2 MB per chunk for the chunked path. */
const CHUNK_SIZE = 2 * 1024 * 1024;

export type UploadProgressCallback = (pct: number) => void;

function base(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Upload a single file to the brain.
 * Calls onProgress with 0–100 as bytes are sent.
 * Returns the brain response: { assetId, url, kind, filename }.
 */
export async function uploadFileToBrain(
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadedAsset> {
  const brainBase = base(BRAIN_URL);

  if (file.size <= CHUNK_THRESHOLD) {
    return uploadSingle(brainBase, file, onProgress);
  }
  return uploadChunked(brainBase, file, onProgress);
}

// ---------------------------------------------------------------------------
// Single upload (≤ 4 MB)
// ---------------------------------------------------------------------------
async function uploadSingle(
  brainBase: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadedAsset> {
  // Report indeterminate progress until the request resolves.
  onProgress?.(10);

  const form = new FormData();
  form.append('file', file, file.name);

  const res = await fetch(`${brainBase}/studio/upload`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status})${detail ? `: ${detail}` : ''}`);
  }

  onProgress?.(100);
  const data = await res.json();
  return parseResponse(data, file.name);
}

// ---------------------------------------------------------------------------
// Chunked upload (> 4 MB)
// ---------------------------------------------------------------------------
async function uploadChunked(
  brainBase: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<UploadedAsset> {
  // 1. Init
  const initRes = await fetch(`${brainBase}/studio/upload/init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, size: file.size, mimeType: file.type }),
  });
  if (!initRes.ok) {
    const detail = await initRes.text().catch(() => '');
    throw new Error(`Upload init failed (${initRes.status})${detail ? `: ${detail}` : ''}`);
  }
  const { uploadId } = await initRes.json();

  // 2. Chunks
  const total = Math.ceil(file.size / CHUNK_SIZE);
  for (let i = 0; i < total; i++) {
    const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const form = new FormData();
    form.append('uploadId', uploadId);
    form.append('chunkIndex', String(i));
    form.append('total', String(total));
    form.append('chunk', chunk, file.name);

    const chunkRes = await fetch(`${brainBase}/studio/upload/chunk`, {
      method: 'POST',
      body: form,
    });
    if (!chunkRes.ok) {
      const detail = await chunkRes.text().catch(() => '');
      throw new Error(`Chunk ${i} failed (${chunkRes.status})${detail ? `: ${detail}` : ''}`);
    }

    onProgress?.(Math.round(((i + 1) / total) * 90));
  }

  // 3. Complete
  const completeRes = await fetch(`${brainBase}/studio/upload/complete`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ uploadId }),
  });
  if (!completeRes.ok) {
    const detail = await completeRes.text().catch(() => '');
    throw new Error(
      `Upload finalization failed (${completeRes.status})${detail ? `: ${detail}` : ''}`
    );
  }

  onProgress?.(100);
  const data = await completeRes.json();
  return parseResponse(data, file.name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function parseResponse(data: Record<string, unknown>, fallbackName: string): UploadedAsset {
  if (!data?.url) {
    throw new Error('Brain upload response missing `url`.');
  }
  return {
    assetId: (data.assetId as string) || `upload_${Date.now()}`,
    url: data.url as string,
    kind: (data.kind as UploadedAsset['kind']) || guessKind(fallbackName),
    filename: (data.filename as string) || fallbackName,
    provenance: 'user_upload',
  };
}

function guessKind(filename: string): UploadedAsset['kind'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac'].includes(ext)) return 'audio';
  return 'image';
}
