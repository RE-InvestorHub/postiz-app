'use client';

// Avatar onboarding wizard — consent-gated registration of a re-drivable clone.
// 4 steps: consent (record + verify) -> likeness upload -> voice upload -> review/create.
//
// The consent HARD gate is enforced both server-side (clone.mjs assertConsentValid
// requires a verified consent record) and here: Create stays disabled until a
// consent_ref is provided AND the operator attests to documented written consent.
// The attestation is the human verification act — it triggers markConsentVerified.
//
// Postiz tokens only; magenta bg-ai accent for primary actions (AI feature).

import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import {
  recordConsent,
  verifyConsent,
  createClone,
  listClones,
  consentPayloadFromDraft,
} from '@gitroom/frontend/components/studio/studio.clone-client';
import {
  ConsentType,
  UploadedAsset,
} from '@gitroom/frontend/components/studio/studio.types';

const CHANNELS = ['instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin'];
const STEPS = ['Consent', 'Likeness', 'Voice', 'Review'];

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'avatar';
}

const fieldCls =
  'h-[40px] px-[12px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText w-full';
const labelCls = 'text-[12px] font-[600] text-btnText';

// ---------------------------------------------------------------------------
// Minimal per-step uploader — writes to a local list via uploadFileToBrain.
// (The shared drop-zone targets the global store; here we need per-step capture.)
// ---------------------------------------------------------------------------
const WizardUploader: FC<{
  acceptMime: string;
  hint: string;
  assets: UploadedAsset[];
  onUploaded: (a: UploadedAsset) => void;
}> = ({ acceptMime, hint, assets, onUploaded }) => {
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const onPick = useCallback(
    (files: FileList | null) => {
      if (!files?.length) return;
      setError(null);
      Array.from(files).forEach((file) => {
        setPending((n) => n + 1);
        uploadFileToBrain(file)
          .then((asset) => onUploaded(asset))
          .catch((e: unknown) => setError((e as Error)?.message ?? String(e)))
          .finally(() => setPending((n) => n - 1));
      });
    },
    [onUploaded]
  );

  return (
    <div className="flex flex-col gap-[10px]">
      <label className="flex flex-col items-center justify-center gap-[6px] rounded-[8px] border-2 border-dashed border-newBorder bg-newBgColor px-[20px] py-[24px] cursor-pointer hover:border-ai/50 transition-colors text-center">
        <span className="text-[13px] font-[600] text-btnText">Browse files</span>
        <span className="text-[11px] text-textItemBlur leading-[1.4]">{hint}</span>
        <input type="file" multiple accept={acceptMime} className="sr-only" onChange={(e) => { onPick(e.target.files); e.target.value = ''; }} />
      </label>
      {pending > 0 && <span className="text-[11px] text-textItemBlur">{pending} uploading…</span>}
      {error && <span className="text-[11px] text-red-400">{error}</span>}
      {assets.length > 0 && (
        <div className="flex flex-col gap-[4px]">
          <span className="text-[11px] text-textItemBlur">{assets.length} uploaded</span>
          <div className="flex flex-wrap gap-[6px]">
            {assets.map((a) => (
              <span key={a.assetId} className="px-[8px] py-[3px] rounded-[6px] bg-newBgColorInner border border-newBorder text-[11px] text-textItemBlur max-w-[180px] truncate">
                {a.filename}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const StudioAvatarOnboarding: FC = () => {
  const { state, dispatch } = useStudio();
  const ob = state.avatarOnboarding;

  const [attested, setAttested] = useState(false);
  const [likeness, setLikeness] = useState<UploadedAsset[]>([]);
  const [voice, setVoice] = useState<UploadedAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ob) return null;

  const { consent, step } = ob;
  const close = () => dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: null });
  const patchConsent = (patch: Partial<typeof consent>) =>
    dispatch({ type: 'PATCH_AVATAR_ONBOARDING', patch: { consent: { ...consent, ...patch } } });
  const goto = (s: number) => dispatch({ type: 'PATCH_AVATAR_ONBOARDING', patch: { step: s } });

  const toggleChannel = (ch: string) =>
    patchConsent({
      consent_channels: consent.consent_channels.includes(ch)
        ? consent.consent_channels.filter((c) => c !== ch)
        : [...consent.consent_channels, ch],
    });

  const consentReady =
    !!consent.person.trim() &&
    !!consent.consent_ref.trim() &&
    consent.consent_channels.length > 0 &&
    attested;
  const wantsVoice = consent.consent_type !== 'visual';

  // Step 0 → record + verify consent, then advance.
  const submitConsent = useCallback(async () => {
    if (!consentReady) return;
    setBusy(true);
    setError(null);
    try {
      const consentId = `consent_${slug(consent.person)}_${Date.now().toString(36)}`;
      await recordConsent(consentPayloadFromDraft(consent, consentId));
      // The operator's attestation IS the human verification act.
      await verifyConsent(consentId, { verifier: 'studio-operator', notes: 'Attested in Studio onboarding' });
      dispatch({ type: 'PATCH_AVATAR_ONBOARDING', patch: { consentId, step: 1 } });
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [consent, consentReady, dispatch]);

  // Step 3 → create the clone.
  const create = useCallback(async () => {
    if (!ob.consentId || likeness.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const cloneId = `clone_${slug(consent.person)}_${Date.now().toString(36)}`;
      await createClone({
        cloneId,
        person: consent.person,
        consentId: ob.consentId,
        photos: likeness.map((a) => a.url),
        voiceSamples: voice.map((a) => a.url),
        skipVoice: voice.length === 0,
      });
      // Refresh the library from the registry, then close.
      const fresh = await listClones();
      dispatch({ type: 'SET_AVATARS', avatars: fresh });
      close();
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [ob.consentId, likeness, voice, consent.person, dispatch]);

  return (
    <div className="flex flex-col gap-[16px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[18px]">
      {/* Stepper */}
      <div className="flex items-center gap-[8px]">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-[8px]">
            <span className={clsx('flex items-center gap-[6px] text-[12px] font-[600]', i === step ? 'text-btnText' : 'text-textItemBlur')}>
              <span className={clsx('w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px]', i === step ? 'bg-ai text-btnText' : i < step ? 'bg-btnSimple text-btnText' : 'bg-newBgColor border border-newBorder text-textItemBlur')}>
                {i + 1}
              </span>
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="w-[16px] h-px bg-newBorder" />}
          </div>
        ))}
      </div>

      {error && <span className="text-[12px] text-red-400 leading-[1.4]">{error}</span>}

      {/* Step 0: Consent */}
      {step === 0 && (
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Person</span>
            <input className={fieldCls} value={consent.person} onChange={(e) => patchConsent({ person: e.target.value })} placeholder="e.g. Lenny (financing coach)" />
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Consent covers</span>
            <select className={fieldCls} value={consent.consent_type} onChange={(e) => patchConsent({ consent_type: e.target.value as ConsentType })}>
              <option value="both">Visual likeness + voice</option>
              <option value="visual">Visual likeness only</option>
              <option value="voice">Voice only</option>
            </select>
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Channels <span className="text-red-400">*</span></span>
            <div className="flex flex-wrap gap-[8px]">
              {CHANNELS.map((ch) => (
                <button key={ch} type="button" onClick={() => toggleChannel(ch)} className={clsx('px-[12px] h-[34px] rounded-[8px] text-[12px] border transition-colors', consent.consent_channels.includes(ch) ? 'bg-ai text-btnText border-transparent' : 'bg-newBgColor border-newBorder text-textItemBlur hover:text-btnText')}>
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Consent expires</span>
            <div className="flex items-center gap-[10px]">
              <label className="flex items-center gap-[6px] text-[12px] text-textItemBlur">
                <input type="checkbox" checked={consent.consent_expires === 'perpetual'} onChange={(e) => patchConsent({ consent_expires: e.target.checked ? 'perpetual' : new Date().toISOString().slice(0, 10) })} />
                Perpetual
              </label>
              {consent.consent_expires !== 'perpetual' && (
                <input type="date" className={clsx(fieldCls, 'max-w-[200px]')} value={consent.consent_expires} onChange={(e) => patchConsent({ consent_expires: e.target.value })} />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Consent document reference <span className="text-red-400">*</span></span>
            <input className={fieldCls} value={consent.consent_ref} onChange={(e) => patchConsent({ consent_ref: e.target.value })} placeholder="Link or ID of the signed consent document" />
          </div>
          <label className="flex items-start gap-[8px] text-[12px] text-textItemBlur leading-[1.45] cursor-pointer">
            <input type="checkbox" className="mt-[2px]" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            <span>I confirm documented written consent is on file covering the selected likeness/voice and commercial use on these channels. This attestation is recorded and required before a clone can be created.</span>
          </label>
          <div className="flex items-center justify-between">
            <button type="button" onClick={close} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Cancel</button>
            <button type="button" disabled={!consentReady || busy} onClick={submitConsent} className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">
              {busy ? 'Recording…' : 'Record consent & continue'}
            </button>
          </div>
        </div>
      )}

      {/* Step 1: Likeness */}
      {step === 1 && (
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-textItemBlur leading-[1.5]">
            Upload likeness reference — 20+ recent, varied-angle photos (or footage) give the best
            Soul ID result. At least one is required to continue.
          </p>
          <WizardUploader acceptMime="image/*,video/*" hint="Images or video — varied angles, good lighting" assets={likeness} onUploaded={(a) => setLikeness((prev) => [...prev, a])} />
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => goto(0)} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Back</button>
            <button type="button" disabled={likeness.length === 0} onClick={() => goto(2)} className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {/* Step 2: Voice */}
      {step === 2 && (
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-textItemBlur leading-[1.5]">
            {wantsVoice
              ? 'Upload 30–60 min of clean, consented audio for an ElevenLabs PVC voice. Optional — skip to build a visual-only clone.'
              : 'Consent is visual-only, so no voice is needed. You can skip this step.'}
          </p>
          {wantsVoice && (
            <WizardUploader acceptMime="audio/*" hint="Audio — clean speech, minimal background noise" assets={voice} onUploaded={(a) => setVoice((prev) => [...prev, a])} />
          )}
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => goto(1)} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Back</button>
            <button type="button" onClick={() => goto(3)} className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px]">
              {voice.length === 0 ? 'Skip & review' : 'Continue'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review + create */}
      {step === 3 && (
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor p-[14px] text-[12px] text-textItemBlur leading-[1.6]">
            <span><span className="text-btnText font-[600]">Person:</span> {consent.person}</span>
            <span><span className="text-btnText font-[600]">Consent:</span> {consent.consent_type} · {consent.consent_channels.join(', ') || 'no channels'} · expires {consent.consent_expires}</span>
            <span><span className="text-btnText font-[600]">Consent ref:</span> {consent.consent_ref}</span>
            <span><span className="text-btnText font-[600]">Likeness:</span> {likeness.length} file(s)</span>
            <span><span className="text-btnText font-[600]">Voice:</span> {voice.length > 0 ? `${voice.length} file(s) (PVC)` : 'none (visual-only)'}</span>
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => goto(2)} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Back</button>
            <button type="button" disabled={!ob.consentId || likeness.length === 0 || busy} onClick={create} className="h-[44px] px-[20px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">
              {busy ? 'Creating avatar…' : 'Create avatar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
