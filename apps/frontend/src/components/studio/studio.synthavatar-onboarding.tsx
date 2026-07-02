'use client';

// Synthetic-avatar onboarding — register a brand-owned, Soul-locked character (e.g. Marcus) as a
// re-drivable talking avatar. 3 steps: pick a Soul-ready character → assign a stock voice → attest
// brand ownership + register (locks one soul portrait). No real person → no consent doc; a single
// brand-ownership attestation replaces it.
//
// Register SPENDS one image (the locked portrait) → the confirm shows a credit estimate + live
// Higgsfield balance before firing (mirrors SoulControl). Postiz tokens; magenta bg-ai accent.

import { FC, useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useToaster } from '@gitroom/react/toaster/toaster';
import {
  SoulAnchor,
  SynthAvatar,
  PortraitOption,
  listSoulAnchors,
  listPortraitOptions,
  registerSynthAvatar,
} from '@gitroom/frontend/components/studio/studio.synthavatar-client';
import { listVoiceLibrary, VoiceOption } from '@gitroom/frontend/components/studio/studio.voice-client';
import { getCredits } from '@gitroom/frontend/components/studio/studio.account-client';
import { uploadFileToBrain } from '@gitroom/frontend/components/studio/studio.upload-client';

const STEPS = ['Character', 'Portrait', 'Voice', 'Register'];
const ASPECTS = ['9:16', '1:1', '16:9'];
const EST_CREDITS = 6; // generating a portrait ≈ a few image credits (picking a frame is free).

const fieldCls =
  'h-[40px] px-[12px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText w-full';
const labelCls = 'text-[12px] font-[600] text-btnText';

export const StudioSynthAvatarOnboarding: FC<{
  brandKitId: string;
  onClose: () => void;
  onCreated: (a: SynthAvatar) => void;
}> = ({ brandKitId, onClose, onCreated }) => {
  const toaster = useToaster();
  const [step, setStep] = useState(0);
  const [anchors, setAnchors] = useState<SoulAnchor[] | null>(null);
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Portrait step: pick a clean reference-sheet frame / upload a headshot (portraitUrl) OR generate one.
  const [portraitOptions, setPortraitOptions] = useState<PortraitOption[] | null>(null);
  const [portraitUrl, setPortraitUrl] = useState<string | null>(null);
  const [portraitMode, setPortraitMode] = useState<'pick' | 'generate' | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    listSoulAnchors(brandKitId)
      .then((a) => setAnchors(a))
      .catch((e) => { setError((e as Error)?.message ?? String(e)); setAnchors([]); });
    listVoiceLibrary()
      .then((v) => setVoices(v.filter((x) => x.ready)))
      .catch(() => setVoices([]));
  }, [brandKitId]);

  // Load the character's clean portrait candidates when a character is chosen.
  useEffect(() => {
    if (!anchorId) { setPortraitOptions(null); return; }
    setPortraitOptions(null); setPortraitUrl(null); setPortraitMode(null);
    listPortraitOptions(anchorId).then(setPortraitOptions).catch(() => setPortraitOptions([]));
  }, [anchorId]);

  const anchor = anchors?.find((a) => a.anchorId === anchorId) || null;
  const voice = voices?.find((v) => v.voiceId === voiceId) || null;

  const previewVoice = useCallback((v: VoiceOption) => {
    if (!v.previewUrl) return;
    if (audioRef.current) { audioRef.current.pause(); }
    const a = new Audio(v.previewUrl);
    audioRef.current = a;
    a.play().catch(() => { /* autoplay/network — ignore */ });
  }, []);

  const doRegister = useCallback(async () => {
    if (!anchorId || !voiceId || !attested || !portraitMode || busy) return;
    const generating = portraitMode === 'generate';
    // Generating spends an image → confirm with the live balance. Picking/uploading is free.
    let balanceLine = '';
    if (generating) {
      try {
        const c = await getCredits();
        if (c.higgsfield?.connected && typeof c.higgsfield.credits === 'number') {
          balanceLine = `\n\nYou have ${c.higgsfield.credits} Higgsfield credits.`;
        }
      } catch { /* show estimate without a balance */ }
    }
    const ok = typeof window === 'undefined' ? true : window.confirm(
      `Register "${name.trim() || anchor?.name || 'this character'}" as a talking avatar?\n\n` +
      (generating
        ? `This GENERATES and locks one clean portrait (reused for every cast). Cost: about ${EST_CREDITS} image credits.${balanceLine}`
        : `This locks the portrait you picked (reused for every cast) — free, no generation.`) +
      `\n\nCasting the avatar with a script later spends voice + lip-sync credits separately.`
    );
    if (!ok) return;

    setBusy(true);
    setError(null);
    try {
      const av = await registerSynthAvatar({
        anchorId, voiceId, voiceLabel: voice?.label, brandOwned: true,
        portraitUrl: portraitMode === 'pick' ? (portraitUrl ?? undefined) : undefined,
        name: name.trim() || undefined, aspectRatio: aspect, brandKitId,
      });
      toaster.show(`"${av.name}" is ready — cast it with a script.`, 'success');
      onCreated(av);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [anchorId, voiceId, attested, portraitMode, portraitUrl, busy, name, anchor, voice, aspect, brandKitId, toaster, onCreated]);

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

      {/* Step 0: pick a Soul-ready character */}
      {step === 0 && (
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-textItemBlur leading-[1.5]">
            Pick a Soul-locked character to turn into a talking avatar. Only characters with a trained
            Soul appear here — their identity stays locked across every clip. Capture and train Souls in
            the Scene Director (Images tab).
          </p>
          {anchors == null ? (
            <span className="text-[12px] text-textItemBlur">Loading characters…</span>
          ) : anchors.length === 0 ? (
            <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] text-[13px] text-textItemBlur leading-[1.5]">
              No Soul-locked characters yet. In the Images tab, save a generated person as a Character,
              then <span className="text-ai font-[600]">⭐ Capture Soul</span> to train it. It will appear here once ready.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-[10px]">
              {anchors.map((a) => (
                <button
                  key={a.anchorId}
                  type="button"
                  onClick={() => { setAnchorId(a.anchorId); if (!name) setName(a.name); }}
                  className={clsx('flex flex-col gap-[6px] rounded-[8px] border p-[8px] text-left transition-colors', anchorId === a.anchorId ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColor hover:border-ai/40')}
                >
                  <div className="w-full aspect-square rounded-[6px] overflow-hidden bg-newBgColorInner border border-newBorder flex items-center justify-center text-[10px] text-textItemBlur">
                    {a.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.thumb} alt={a.name} className="w-full h-full object-cover" />
                    ) : 'No image'}
                  </div>
                  <span className="text-[12px] font-[600] text-btnText truncate">{a.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between">
            <button type="button" onClick={onClose} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Cancel</button>
            <button type="button" disabled={!anchorId} onClick={() => setStep(1)} className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {/* Step 1: portrait — pick a clean reference-sheet frame, upload a headshot, or generate one */}
      {step === 1 && (
        <div className="flex flex-col gap-[14px]">
          <p className="text-[13px] text-textItemBlur leading-[1.5]">
            Choose the portrait that gets animated. Pick one of this character’s clean reference-sheet
            frames (recommended — free, already chrome-free), upload your own headshot, or generate a fresh one.
          </p>
          {portraitOptions == null ? (
            <span className="text-[12px] text-textItemBlur">Loading portraits…</span>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-[8px]">
              {portraitOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setPortraitUrl(p.url); setPortraitMode('pick'); }}
                  className={clsx('aspect-square rounded-[8px] overflow-hidden border transition-colors', portraitMode === 'pick' && portraitUrl === p.url ? 'border-ai ring-2 ring-ai/40' : 'border-newBorder hover:border-ai/40')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="portrait option" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-[10px]">
            <label className="h-[36px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[12px] font-[600] flex items-center gap-[6px] cursor-pointer">
              {uploading ? 'Uploading…' : '⬆ Upload a headshot'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = '';
                  if (!f) return;
                  setUploading(true); setError(null);
                  uploadFileToBrain(f)
                    .then((a) => { setPortraitUrl(a.url); setPortraitMode('pick'); })
                    .catch((err) => setError((err as Error)?.message ?? String(err)))
                    .finally(() => setUploading(false));
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => { setPortraitMode('generate'); setPortraitUrl(null); }}
              className={clsx('h-[36px] px-[12px] rounded-[8px] text-[12px] font-[600] border transition-colors', portraitMode === 'generate' ? 'bg-ai text-btnText border-transparent' : 'bg-newBgColor border-newBorder text-textItemBlur hover:text-btnText')}
            >
              ✨ Generate a clean one ($)
            </button>
            {portraitMode === 'generate' && <span className="text-[11px] text-textItemBlur">Generates a fresh chrome-free headshot at register (small image spend).</span>}
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(0)} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Back</button>
            <button type="button" disabled={!portraitMode} onClick={() => setStep(2)} className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {/* Step 2: assign a stock voice + name + aspect */}
      {step === 2 && (
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Avatar name</span>
            <input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder={anchor?.name || 'e.g. Marcus'} />
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Voice</span>
            <p className="text-[11px] text-textItemBlur leading-[1.4]">A stock voice — no cloning, no consent. Tap ▶ to preview.</p>
            {voices == null ? (
              <span className="text-[12px] text-textItemBlur">Loading voices…</span>
            ) : (
              <div className="flex flex-col gap-[6px] max-h-[220px] overflow-y-auto pr-[4px]">
                {voices.map((v) => (
                  <div key={v.voiceId} className={clsx('flex items-center gap-[8px] rounded-[8px] border p-[8px]', voiceId === v.voiceId ? 'border-ai bg-ai/10' : 'border-newBorder bg-newBgColor')}>
                    {v.previewUrl && (
                      <button type="button" onClick={() => previewVoice(v)} title="Preview" className="w-[28px] h-[28px] shrink-0 rounded-full bg-newBgColorInner border border-newBorder text-btnText text-[11px] flex items-center justify-center hover:border-ai/50">▶</button>
                    )}
                    <button type="button" onClick={() => setVoiceId(v.voiceId)} className="flex-1 min-w-0 text-left">
                      <span className="text-[12px] font-[600] text-btnText truncate block">{v.label}</span>
                      <span className="text-[10px] text-textItemBlur uppercase">{v.source}</span>
                    </button>
                    {voiceId === v.voiceId && <span className="text-ai text-[12px] font-[700] shrink-0">✓</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-[6px]">
            <span className={labelCls}>Aspect ratio</span>
            <div className="flex items-center gap-[8px]">
              {ASPECTS.map((ar) => (
                <button key={ar} type="button" onClick={() => setAspect(ar)} className={clsx('px-[12px] h-[34px] rounded-[8px] text-[12px] border transition-colors', aspect === ar ? 'bg-ai text-btnText border-transparent' : 'bg-newBgColor border-newBorder text-textItemBlur hover:text-btnText')}>{ar}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(1)} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Back</button>
            <button type="button" disabled={!voiceId} onClick={() => setStep(3)} className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">Continue</button>
          </div>
        </div>
      )}

      {/* Step 3: brand-ownership attestation + register */}
      {step === 3 && (
        <div className="flex flex-col gap-[14px]">
          <div className="flex flex-col gap-[6px] rounded-[8px] border border-newBorder bg-newBgColor p-[14px] text-[12px] text-textItemBlur leading-[1.6]">
            <span><span className="text-btnText font-[600]">Character:</span> {anchor?.name}</span>
            <span><span className="text-btnText font-[600]">Name:</span> {name.trim() || anchor?.name}</span>
            <span><span className="text-btnText font-[600]">Voice:</span> {voice?.label}</span>
            <span><span className="text-btnText font-[600]">Portrait:</span> {portraitMode === 'generate' ? 'generate a clean one' : 'picked'}</span>
            <span><span className="text-btnText font-[600]">Aspect:</span> {aspect}</span>
          </div>
          <label className="flex items-start gap-[8px] text-[12px] text-textItemBlur leading-[1.45] cursor-pointer">
            <input type="checkbox" className="mt-[2px]" checked={attested} onChange={(e) => setAttested(e.target.checked)} />
            <span>This is a brand-owned, fully synthetic character (not a real person). I have the right to use it commercially. This attestation replaces real-person consent for synthetic avatars.</span>
          </label>
          <p className="text-[11px] text-textItemBlur leading-[1.4]">
            {portraitMode === 'generate'
              ? 'Registering generates and locks one clean portrait — a small image spend. You’ll confirm the estimate next.'
              : 'Registering locks the portrait you picked — free, no generation.'}
          </p>
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => setStep(2)} className="h-[40px] px-[16px] rounded-[8px] bg-btnSimple text-btnText text-[13px]">Back</button>
            <button type="button" disabled={!attested || busy} onClick={doRegister} className="h-[44px] px-[20px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-50">
              {busy ? 'Registering…' : 'Register avatar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
