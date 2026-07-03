'use client';

// Avatar onboarding — in-progress drafts + consent cleanup. Shown on the Avatars tab entry.
//   • In-progress avatars: runs the user started but didn't finish. Resume reopens the wizard
//     hydrated from the saved draft; Delete abandons it.
//   • Consent records: documented-consent artifacts left by abandoned runs — deletable here (the
//     brain refuses to delete one tied to a live avatar).
// Postiz tokens only; magenta bg-ai accent for the primary Resume action.

import { FC, useCallback, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import {
  listAvatarDrafts,
  deleteAvatarDraft,
  listConsentRecords,
  deleteConsent,
  AvatarDraft,
  ConsentSummary,
} from '@gitroom/frontend/components/studio/studio.clone-client';
import { emptyConsentDraft } from '@gitroom/frontend/components/studio/studio.types';

const STEP_LABELS = ['Consent', 'Likeness', 'Voice', 'Review'];

export const StudioAvatarDrafts: FC<{ brandKitId: string; reloadSignal?: number }> = ({ brandKitId, reloadSignal }) => {
  const { dispatch } = useStudio();
  const [drafts, setDrafts] = useState<AvatarDraft[]>([]);
  const [consents, setConsents] = useState<ConsentSummary[]>([]);
  const [showConsents, setShowConsents] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
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

  useEffect(() => { void load(); }, [load, reloadSignal]);

  const resume = (d: AvatarDraft) => {
    dispatch({
      type: 'SET_AVATAR_ONBOARDING',
      onboarding: {
        open: true,
        step: d.step ?? 0,
        consent: d.consent || emptyConsentDraft,
        consentId: d.consent_id || undefined,
        draftId: d.draft_id,
        likenessAssetIds: (d.likeness || []).map((a) => a.assetId),
        voiceAssetIds: (d.voice || []).map((a) => a.assetId),
      },
    });
  };

  const removeDraft = async (id: string) => {
    setBusy(id);
    setError(null);
    try { await deleteAvatarDraft(id); await load(); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  const removeConsent = async (id: string) => {
    setBusy(id);
    setError(null);
    try { await deleteConsent(id); await load(); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  };

  if (drafts.length === 0 && consents.length === 0) return null;

  return (
    <div className="flex flex-col gap-[14px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[16px]">
      {error && <span className="text-[12px] text-red-400">{error}</span>}

      {drafts.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          <h3 className="text-[13px] font-[600] text-btnText">In-progress avatars</h3>
          <p className="text-[12px] text-textItemBlur leading-[1.5]">Pick up a run you started, or abandon it.</p>
          <div className="flex flex-col gap-[6px]">
            {drafts.map((d) => (
              <div key={d.draft_id} className="flex items-center justify-between gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[8px]">
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-[600] text-btnText truncate">{d.person || 'Untitled avatar'}</span>
                  <span className="text-[11px] text-textItemBlur">
                    {STEP_LABELS[d.step] || `Step ${d.step}`} · {d.likeness.length} photo(s){d.consent_id ? ' · consent recorded' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-[6px] shrink-0">
                  <button type="button" onClick={() => resume(d)} className="h-[32px] px-[12px] rounded-[8px] bg-ai text-btnText text-[12px] font-[600] hover:opacity-90">Resume</button>
                  <button type="button" disabled={busy === d.draft_id} onClick={() => removeDraft(d.draft_id)} className="h-[32px] px-[12px] rounded-[8px] bg-btnSimple text-textItemBlur text-[12px] hover:text-btnText disabled:opacity-50">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {consents.length > 0 && (
        <div className="flex flex-col gap-[8px]">
          <button type="button" onClick={() => setShowConsents((v) => !v)} className="self-start text-[12px] font-[600] text-textItemBlur hover:text-btnText">
            {showConsents ? '▾' : '▸'} Consent records ({consents.length})
          </button>
          {showConsents && (
            <div className="flex flex-col gap-[6px]">
              <p className="text-[11px] text-textItemBlur leading-[1.5]">
                Documented-consent records. Delete any left by abandoned runs — a record tied to a live avatar can’t be deleted.
              </p>
              {consents.map((c) => (
                <div key={c.consent_id} className="flex items-center justify-between gap-[10px] rounded-[8px] border border-newBorder bg-newBgColor px-[12px] py-[7px]">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[12px] text-btnText truncate">{c.person || c.consent_id}</span>
                    <span className="text-[10px] text-textItemBlur truncate">{c.status}{c.revoked ? ' · revoked' : ''} · {c.consent_id}</span>
                  </div>
                  <button type="button" disabled={busy === c.consent_id} onClick={() => removeConsent(c.consent_id)} className="h-[30px] px-[10px] rounded-[8px] bg-btnSimple text-textItemBlur text-[11px] hover:text-red-400 disabled:opacity-50 shrink-0">Delete</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
