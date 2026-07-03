'use client';

// Resume-an-avatar modal (real-clone only). One dropdown lists prior creations:
//   • in-progress drafts (resume exactly where you left off), and
//   • recorded consents with no draft yet (continue from that verified consent).
// Continue opens the wizard at the Likeness step with the consent durably stitched; any photos/voice
// already attached stay attached until the avatar is created. Abandon/Delete cleans one up here.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { StudioModal } from '@gitroom/frontend/components/studio/studio.modal';
import {
  listAvatarDrafts,
  deleteAvatarDraft,
  listConsentRecords,
  deleteConsent,
  getConsentRecord,
  AvatarDraft,
  ConsentSummary,
  FullConsentRecord,
} from '@gitroom/frontend/components/studio/studio.clone-client';
import { AvatarConsentDraft, ConsentType, emptyConsentDraft } from '@gitroom/frontend/components/studio/studio.types';

const STEP_LABELS = ['Consent', 'Likeness', 'Voice', 'Review'];

/** Rebuild the wizard's consent form from a stored consent record (for continue-from-consent). */
function consentDraftFromRecord(r: FullConsentRecord): AvatarConsentDraft {
  const visual = r.scope?.visual_likeness ?? true;
  const voice = r.scope?.voice ?? false;
  const consent_type: ConsentType = visual && voice ? 'both' : voice ? 'voice' : 'visual';
  return {
    person: r.person || '',
    consent_type,
    consent_channels: r.scope?.channels || [],
    consent_expires: r.scope?.duration || 'perpetual',
    consent_ref: r.document_ref || '',
  };
}

type Option =
  | { kind: 'draft'; id: string; label: string; draft: AvatarDraft }
  | { kind: 'consent'; id: string; label: string; consent: ConsentSummary };

export const StudioAvatarResumeModal: FC<{ brandKitId: string; onClose: () => void; onResumed?: () => void }> = ({ brandKitId, onClose, onResumed }) => {
  const { dispatch } = useStudio();
  const [drafts, setDrafts] = useState<AvatarDraft[]>([]);
  const [consents, setConsents] = useState<ConsentSummary[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([listAvatarDrafts(brandKitId), listConsentRecords()]);
      setDrafts(d);
      setConsents(c);
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    }
  }, [brandKitId]);
  useEffect(() => { void load(); }, [load]);

  // A consent already carried by a draft is shown via that draft — don't duplicate it as "consent only".
  const draftConsentIds = useMemo(() => new Set(drafts.map((d) => d.consent_id).filter(Boolean) as string[]), [drafts]);
  const standaloneConsents = useMemo(
    () => consents.filter((c) => !draftConsentIds.has(c.consent_id) && !c.revoked),
    [consents, draftConsentIds],
  );

  const options: Option[] = useMemo(() => [
    ...drafts.map((d) => ({
      kind: 'draft' as const,
      id: `draft:${d.draft_id}`,
      label: `${d.person || 'Untitled'} — ${STEP_LABELS[d.step] || `Step ${d.step}`} · ${d.likeness.length} photo(s)`,
      draft: d,
    })),
    ...standaloneConsents.map((c) => ({
      kind: 'consent' as const,
      id: `consent:${c.consent_id}`,
      label: `${c.person || c.consent_id} — consent only (${c.status})`,
      consent: c,
    })),
  ], [drafts, standaloneConsents]);

  const selectedOption = options.find((o) => o.id === selected) || null;

  const resumeDraft = (d: AvatarDraft) => {
    dispatch({
      type: 'SET_AVATAR_ONBOARDING',
      onboarding: {
        open: true,
        step: Math.max(1, d.step ?? 1),
        consent: d.consent || emptyConsentDraft,
        consentId: d.consent_id || undefined,
        draftId: d.draft_id,
        likenessAssetIds: (d.likeness || []).map((a) => a.assetId),
        voiceAssetIds: (d.voice || []).map((a) => a.assetId),
      },
    });
    onResumed?.();
  };

  const continueFromConsent = async (c: ConsentSummary) => {
    setBusy(true);
    setError(null);
    try {
      const rec = await getConsentRecord(c.consent_id);
      dispatch({
        type: 'SET_AVATAR_ONBOARDING',
        onboarding: {
          open: true,
          step: 1, // Likeness — consent is already recorded + verified
          consent: consentDraftFromRecord(rec),
          consentId: c.consent_id,
          likenessAssetIds: [],
          voiceAssetIds: [],
        },
      });
      onResumed?.();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const onContinue = () => {
    if (!selectedOption) return;
    if (selectedOption.kind === 'draft') resumeDraft(selectedOption.draft);
    else void continueFromConsent(selectedOption.consent);
  };

  const removeSelected = async () => {
    if (!selectedOption) return;
    setBusy(true);
    setError(null);
    try {
      if (selectedOption.kind === 'draft') await deleteAvatarDraft(selectedOption.draft.draft_id);
      else await deleteConsent(selectedOption.consent.consent_id);
      setSelected('');
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const empty = options.length === 0;

  return (
    <StudioModal title="Resume an avatar" subtitle="Pick up a run you started, or continue from a recorded consent." onClose={onClose} width={520}>
      <div className="flex flex-col gap-[14px]">
        {error && <span className="text-[12px] text-red-400">{error}</span>}
        {empty ? (
          <p className="text-[13px] text-textItemBlur leading-[1.5]">
            No in-progress runs or unused consent records. Start a new avatar with <span className="text-btnText">Create</span>.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-[6px]">
              <span className="text-[12px] font-[600] text-btnText">Previous creation</span>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="h-[40px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText"
              >
                <option value="">Select a run or consent…</option>
                {options.some((o) => o.kind === 'draft') && (
                  <optgroup label="In progress">
                    {options.filter((o) => o.kind === 'draft').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </optgroup>
                )}
                {options.some((o) => o.kind === 'consent') && (
                  <optgroup label="Recorded consents">
                    {options.filter((o) => o.kind === 'consent').map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <p className="text-[11px] text-textItemBlur leading-[1.5]">
              Continue opens the wizard at the <span className="text-btnText">Likeness</span> step with the consent stitched.
              Any photos or voice already attached stay attached until you create the avatar.
            </p>
            <div className="flex items-center justify-between gap-[8px]">
              <button
                type="button"
                disabled={!selectedOption || busy}
                onClick={removeSelected}
                className="h-[38px] px-[14px] rounded-[8px] bg-btnSimple text-textItemBlur text-[12px] hover:text-red-400 disabled:opacity-40"
              >
                {selectedOption?.kind === 'consent' ? 'Delete consent' : 'Abandon'}
              </button>
              <button
                type="button"
                disabled={!selectedOption || busy}
                onClick={onContinue}
                className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] disabled:opacity-40"
              >
                {busy ? 'Opening…' : 'Continue'}
              </button>
            </div>
          </>
        )}
      </div>
    </StudioModal>
  );
};
