'use client';

// Avatar record modal — the HeyGen-style "Record / Upload audio" popover for the Avatars canvas.
// Reuses StudioVoiceCapture (mic record OR file upload → brain asset) and adds the voice-mirroring
// toggle: OFF = the clip uses the user's own voice; ON = ElevenLabs speech-to-speech mirrors the take
// into the avatar's voice (keeps the delivery, swaps the timbre). Mirroring SPENDS voice credits.
//
// Postiz tokens only; magenta bg-ai accent (AI feature).

import { FC, useState } from 'react';
import { StudioModal } from '@gitroom/frontend/components/studio/studio.modal';
import { StudioVoiceCapture } from '@gitroom/frontend/components/studio/studio.voice-capture';
import { UploadedAsset } from '@gitroom/frontend/components/studio/studio.types';
import { mirrorVoice } from '@gitroom/frontend/components/studio/studio.voice-client';

export interface RecordedAudio { assetId: string; url: string; label: string; mirrored: boolean }

export const StudioAvatarRecordModal: FC<{
  voiceId?: string | null;
  voiceLabel?: string | null;
  brandKitId?: string;
  onClose: () => void;
  onDone: (audio: RecordedAudio) => void;
}> = ({ voiceId, voiceLabel, brandKitId, onClose, onDone }) => {
  const [mirror, setMirror] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUploaded = async (asset: UploadedAsset) => {
    setError(null);
    // Raw path — the user's own voice drives the lip-sync (free).
    if (!mirror) { onDone({ assetId: asset.assetId, url: asset.url, label: 'Your recording', mirrored: false }); return; }
    // Mirror path — speech-to-speech into the avatar's voice (gated: spends EL credits).
    if (!voiceId) { setError('This avatar has no voice to mirror into — turn mirroring off, or assign a voice first.'); return; }
    setBusy(true);
    try {
      const m = await mirrorVoice({ srcUrl: asset.url, voiceId, brandKitId });
      onDone({ assetId: m.id, url: m.url, label: `Mirrored → ${voiceLabel || 'avatar voice'}`, mirrored: true });
    } catch (e) {
      setError((e as Error)?.message ?? 'Voice mirroring failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StudioModal title="Record or upload audio" subtitle="Drive the lip-sync with your own voice" onClose={onClose} width={560}>
      <div className="flex flex-col gap-[14px]">
        {/* Voice-mirroring toggle */}
        <label className="flex items-start gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor p-[12px] cursor-pointer">
          <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} disabled={!voiceId} className="mt-[3px] accent-[var(--new-ai-btn)]" />
          <span className="flex flex-col gap-[2px]">
            <span className="text-[13px] font-[600] text-btnText">Mirror into the avatar&apos;s voice{voiceLabel ? ` (${voiceLabel})` : ''}</span>
            <span className="text-[11px] text-textItemBlur leading-[1.5]">
              Off — the clip keeps your own voice. On — ElevenLabs speech-to-speech holds your delivery and timing but swaps in the avatar&apos;s voice. Spends voice credits.
            </span>
          </span>
        </label>

        {busy ? (
          <div className="flex items-center gap-[8px] text-[12px] text-ai py-[10px]">
            <span className="inline-block w-[13px] h-[13px] rounded-full border-2 border-ai border-t-transparent animate-spin" aria-hidden="true" />
            Mirroring your take into the avatar&apos;s voice…
          </div>
        ) : (
          <StudioVoiceCapture onUploaded={handleUploaded} multiple={false} />
        )}

        {error && <span className="text-[12px] text-red-400">{error}</span>}
      </div>
    </StudioModal>
  );
};
