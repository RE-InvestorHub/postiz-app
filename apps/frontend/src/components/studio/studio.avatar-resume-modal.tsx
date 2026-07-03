'use client';

// Resume-an-avatar modal (real-clone only). Lists prior creations as selectable rows:
//   • in-progress drafts (resume exactly where you left off), and
//   • recorded consents with no draft yet (continue from that verified consent).
// Per row: Continue opens the wizard at the Likeness step with the consent stitched (any attached
// photos/voice stay attached). Check rows + "Delete selected" to PURGE runs — for a draft that means
// the draft + its consent + its uploaded likeness/voice assets; for a bare consent, the consent.
// (A consent tied to a live avatar is refused server-side.)

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { StudioModal } from '@gitroom/frontend/components/studio/studio.modal';
import {
  listAvatarDrafts,
  purgeAvatarDraft,
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

type Row =
  | { key: string; kind: 'draft'; person: string; sub: string; draft: AvatarDraft }
  | { key: string; kind: 'consent'; person: string; sub: string; consent: ConsentSummary };

export const StudioAvatarResumeModal: FC<{ brandKitId: string; onClose: () => void; onResumed?: () => void }> = ({ brandKitId, onClose, onResumed }) => {
  const { dispatch } = useStudio();
  const [drafts, setDrafts] = useState<AvatarDraft[]>([]);
  const [consents, setConsents] = useState<ConsentSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const rows: Row[] = useMemo(() => [
    ...drafts.map((d): Row => ({
      key: `draft:${d.draft_id}`,
      kind: 'draft',
      person: d.person || 'Untitled avatar',
      sub: `In progress · ${STEP_LABELS[d.step] || `Step ${d.step}`} · ${d.likeness.length} photo(s)`,
      draft: d,
    })),
    ...standaloneConsents.map((c): Row => ({
      key: `consent:${c.consent_id}`,
      kind: 'consent',
      person: c.person || c.consent_id,
      sub: `Consent only · ${c.status}`,
      consent: c,
    })),
  ], [drafts, standaloneConsents]);

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

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

  const onContinue = (row: Row) => {
    if (row.kind === 'draft') resumeDraft(row.draft);
    else void continueFromConsent(row.consent);
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    const n = selected.size;
    if (typeof window !== 'undefined' && !window.confirm(`Delete ${n} run${n > 1 ? 's' : ''}? For each, this removes the consent record and any uploaded photos/voice from that run. This cannot be undone.`)) return;
    setBusy(true);
    setError(null);
    try {
      const chosen = rows.filter((r) => selected.has(r.key));
      const results = await Promise.allSettled(chosen.map((r) =>
        r.kind === 'draft' ? purgeAvatarDraft(r.draft.draft_id) : deleteConsent(r.consent.consent_id),
      ));
      const failed = results.filter((x) => x.status === 'rejected');
      if (failed.length) setError(`${failed.length} of ${n} could not be deleted (a consent tied to a live avatar is protected).`);
      setSelected(new Set());
      await load();
    } catch (e) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  const empty = rows.length === 0;

  return (
    <StudioModal
      title="Resume an avatar"
      subtitle="Pick up a run you started or continue from a recorded consent — or select runs to clean up."
      onClose={onClose}
      width={560}
      footer={!empty ? (
        <div className="flex items-center justify-between gap-[8px]">
          <span className="text-[11px] text-textItemBlur">{selected.size > 0 ? `${selected.size} selected` : 'Check rows to delete'}</span>
          <div className="flex items-center gap-[8px]">
            {selected.size > 0 && (
              <button
                type="button"
                disabled={busy}
                onClick={() => setSelected(new Set())}
                className="h-[38px] px-[14px] rounded-[8px] bg-btnSimple text-textItemBlur text-[12px] hover:text-btnText disabled:opacity-40"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={deleteSelected}
              className="h-[38px] px-[14px] rounded-[8px] bg-red-500/90 text-white text-[12px] font-[600] hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Working…' : `Delete selected${selected.size ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>
      ) : undefined}
    >
      <div className="flex flex-col gap-[12px]">
        {error && <span className="text-[12px] text-red-400">{error}</span>}
        {empty ? (
          <p className="text-[13px] text-textItemBlur leading-[1.5]">
            No in-progress runs or unused consent records. Start a new avatar with <span className="text-btnText">Create</span>.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-textItemBlur leading-[1.5]">
              Continue opens the wizard at the <span className="text-btnText">Likeness</span> step with the consent stitched;
              attached photos/voice stay attached until you create the avatar.
            </p>
            <div className="flex flex-col gap-[6px]">
              {rows.map((row) => {
                const isSel = selected.has(row.key);
                return (
                  <div key={row.key} className={clsx('flex items-center gap-[10px] rounded-[8px] border px-[12px] py-[8px]', isSel ? 'border-red-400/60 bg-red-500/5' : 'border-newBorder bg-newBgColor')}>
                    <button
                      type="button"
                      onClick={() => toggle(row.key)}
                      aria-label={isSel ? 'Deselect' : 'Select for deletion'}
                      className={clsx('shrink-0 w-[18px] h-[18px] rounded-[5px] border-2 flex items-center justify-center text-[10px] leading-none', isSel ? 'bg-red-500 border-red-500 text-white' : 'bg-newBgColorInner border-newBorder')}
                    >
                      {isSel ? '✓' : ''}
                    </button>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-[600] text-btnText truncate">{row.person}</span>
                      <span className="text-[11px] text-textItemBlur truncate">{row.sub}</span>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onContinue(row)}
                      className="shrink-0 h-[32px] px-[12px] rounded-[8px] bg-ai text-btnText text-[12px] font-[600] hover:opacity-90 disabled:opacity-50"
                    >
                      Continue
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </StudioModal>
  );
};
