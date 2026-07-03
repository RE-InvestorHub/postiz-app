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

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';
import { listBrandImages, BrandImage } from '@gitroom/frontend/components/studio/studio.image-client';
import {
  recordConsent,
  verifyConsent,
  createClone,
  listClones,
  consentPayloadFromDraft,
  saveAvatarDraft,
  deleteAvatarDraft,
  getAvatarDraft,
} from '@gitroom/frontend/components/studio/studio.clone-client';
import {
  ConsentType,
  CloneTier,
  UploadedAsset,
} from '@gitroom/frontend/components/studio/studio.types';
import { StudioVoiceCapture } from '@gitroom/frontend/components/studio/studio.voice-capture';

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

// ---------------------------------------------------------------------------
// Library picker — choose existing brand-library images as likeness references,
// so a likeness can be built with NO OS file dialog (uploads are optional). Maps
// a BrandImage to the same UploadedAsset shape the uploader produces.
// ---------------------------------------------------------------------------
const LibraryPicker: FC<{
  brandKitId: string;
  selectedIds: Set<string>;
  onToggle: (a: UploadedAsset) => void;
}> = ({ brandKitId, selectedIds, onToggle }) => {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<BrandImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setImages(await listBrandImages(brandKitId));
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }, [brandKitId]);

  // Load (and refresh) the library whenever the panel is opened or the brand changes.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const toAsset = (img: BrandImage): UploadedAsset => ({
    assetId: img.id,
    url: img.url,
    kind: 'image',
    filename: img.url.split('/').pop()?.split('?')[0] || 'library-image',
    provenance: 'user_upload',
  });

  return (
    <div className="flex flex-col gap-[10px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="h-[36px] px-[14px] self-start rounded-[8px] border border-newBorder bg-newBgColorInner text-[12px] font-[600] text-btnText hover:border-ai/50 transition-colors"
      >
        {open ? 'Hide image library' : 'Choose from image library'}
      </button>
      {open && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[10px]">
          {loading && <span className="text-[11px] text-textItemBlur">Loading library…</span>}
          {error && <span className="text-[11px] text-red-400">{error}</span>}
          {!loading && !error && images.length === 0 && (
            <span className="text-[11px] text-textItemBlur">
              No images in this brand’s library yet — upload some above, or generate them in the Images tab.
            </span>
          )}
          {images.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-[6px] max-h-[240px] overflow-y-auto">
              {images.map((img) => {
                const sel = selectedIds.has(img.id);
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => onToggle(toAsset(img))}
                    title={sel ? 'Selected — click to remove' : 'Click to add as likeness'}
                    className={clsx(
                      'relative aspect-square rounded-[6px] overflow-hidden border-2 transition-colors',
                      sel ? 'border-ai' : 'border-transparent hover:border-newBorder'
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt="" className="w-full h-full object-cover" />
                    {sel && (
                      <span className="absolute top-[3px] right-[3px] w-[16px] h-[16px] rounded-full bg-ai text-btnText text-[10px] font-[700] flex items-center justify-center leading-none">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
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
  const [tier, setTier] = useState<CloneTier>('ivc');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After a PVC create: surface the verification/training requirement before close.
  const [pvcNote, setPvcNote] = useState<string | null>(null);
  const hydrated = useRef(false);

  // Resume: hydrate local likeness/voice/tier from a saved draft when the wizard opens on one.
  useEffect(() => {
    if (!ob?.draftId || hydrated.current) return;
    hydrated.current = true;
    getAvatarDraft(ob.draftId)
      .then((d) => {
        setLikeness((d.likeness || []).map((a) => ({ assetId: a.assetId, url: a.url, kind: 'image' as const, filename: a.filename, provenance: 'user_upload' as const })));
        setVoice((d.voice || []).map((a) => ({ assetId: a.assetId, url: a.url, kind: 'audio' as const, filename: a.filename, provenance: 'user_upload' as const })));
        if (d.tier) setTier(d.tier);
        setAttested(!!d.consent_id);
      })
      .catch(() => {});
  }, [ob?.draftId]);

  // Auto-save wizard progress to a server-side draft (so navigating away can be resumed).
  useEffect(() => {
    if (!ob) return;
    const person = ob.consent.person;
    const meaningful = !!ob.consentId || likeness.length > 0 || !!person.trim();
    if (!meaningful) return;
    const t = setTimeout(() => {
      saveAvatarDraft({
        draftId: ob.draftId,
        person,
        step: ob.step,
        tier,
        wantsVoice: ob.consent.consent_type !== 'visual',
        consentType: ob.consent.consent_type,
        consentId: ob.consentId ?? null,
        consent: ob.consent,
        likeness: likeness.map((a) => ({ assetId: a.assetId, url: a.url, filename: a.filename })),
        voice: voice.map((a) => ({ assetId: a.assetId, url: a.url, filename: a.filename })),
        brandKitId: state.composerBrandKitId || 'default',
      })
        .then((d) => {
          if (d?.draft_id && d.draft_id !== ob.draftId) {
            dispatch({ type: 'PATCH_AVATAR_ONBOARDING', patch: { draftId: d.draft_id } });
          }
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ob?.step, ob?.consentId, ob?.draftId, ob?.consent, likeness, voice, tier]);

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
      const usingVoice = wantsVoice && voice.length > 0;
      await createClone({
        cloneId,
        person: consent.person,
        consentId: ob.consentId,
        photos: likeness.map((a) => a.url),
        voiceSamples: voice.map((a) => a.url),
        skipVoice: !usingVoice,
        cloneTier: usingVoice ? tier : undefined,
      });
      // The clone now exists — the draft is obsolete, so remove it.
      if (ob.draftId) deleteAvatarDraft(ob.draftId).catch(() => {});
      // Refresh the library from the registry.
      const fresh = await listClones();
      dispatch({ type: 'SET_AVATARS', avatars: fresh });
      // PVC needs in-product verification + a training queue — surface that and let
      // the user close manually. IVC / visual-only is ready immediately, so close.
      if (usingVoice && tier === 'pvc') {
        setPvcNote(
          'Avatar created. The PVC voice is NOT ready yet: the talent must complete voice ' +
          'verification in ElevenLabs (read the prompted phrase), then training runs (3-6h). ' +
          'The voice activates once verified + trained.'
        );
      } else {
        close();
      }
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [ob.consentId, likeness, voice, consent.person, wantsVoice, tier, dispatch]);

  // PVC post-create takeover: the clone exists but the voice needs verification + training.
  if (pvcNote) {
    return (
      <div className="flex flex-col gap-[14px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[18px]">
        <h3 className="text-[14px] font-[600] text-btnText">Voice verification required</h3>
        <p className="text-[13px] text-textItemBlur leading-[1.6]">{pvcNote}</p>
        <button type="button" onClick={() => { setPvcNote(null); close(); }} className="self-start h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px]">
          Done
        </button>
      </div>
    );
  }

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
            Add likeness reference — 20+ recent, varied-angle photos (or footage) give the best
            Soul ID result. Upload new files or choose from your image library. At least one is required to continue.
          </p>
          <WizardUploader acceptMime="image/*,video/*" hint="Images or video — varied angles, good lighting" assets={likeness} onUploaded={(a) => setLikeness((prev) => (prev.some((x) => x.assetId === a.assetId) ? prev : [...prev, a]))} />
          <LibraryPicker
            brandKitId={state.composerBrandKitId || 'default'}
            selectedIds={new Set(likeness.map((a) => a.assetId))}
            onToggle={(a) =>
              setLikeness((prev) =>
                prev.some((x) => x.assetId === a.assetId)
                  ? prev.filter((x) => x.assetId !== a.assetId)
                  : [...prev, a]
              )
            }
          />
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
              ? 'Record or upload consented audio to clone this person’s voice. Optional — skip for a visual-only clone.'
              : 'Consent is visual-only, so no voice is needed. You can skip this step.'}
          </p>
          {wantsVoice && (
            <>
              {/* Clone tier */}
              <div className="flex flex-col gap-[8px]">
                <span className={labelCls}>Voice clone quality</span>
                <div className="flex flex-col gap-[6px]">
                  <label className="flex items-start gap-[8px] text-[12px] text-textItemBlur leading-[1.45] cursor-pointer">
                    <input type="radio" name="tier" className="mt-[2px]" checked={tier === 'ivc'} onChange={() => setTier('ivc')} />
                    <span><span className="text-btnText font-[600]">Instant (IVC)</span> — ready in seconds from ~1-5 min of audio. Great for prototypes and quick lines; lower fidelity.</span>
                  </label>
                  <label className="flex items-start gap-[8px] text-[12px] text-textItemBlur leading-[1.45] cursor-pointer">
                    <input type="radio" name="tier" className="mt-[2px]" checked={tier === 'pvc'} onChange={() => setTier('pvc')} />
                    <span><span className="text-btnText font-[600]">Professional (PVC)</span> — broadcast quality from 30-60 min of audio. Requires the talent to verify in ElevenLabs + a 3-6h training queue.</span>
                  </label>
                </div>
              </div>
              <StudioVoiceCapture onUploaded={(a) => setVoice((prev) => [...prev, a])} />
              {voice.length > 0 && (
                <span className="text-[11px] text-textItemBlur">{voice.length} voice sample(s) captured</span>
              )}
            </>
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
            <span><span className="text-btnText font-[600]">Voice:</span> {wantsVoice && voice.length > 0 ? `${voice.length} sample(s) (${tier.toUpperCase()})` : 'none (visual-only)'}</span>
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
