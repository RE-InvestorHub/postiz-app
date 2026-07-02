'use client';

// Avatar library — card grid over the brain clone registry. Shows each clone's
// likeness/voice, lifecycle status, and consent at a glance, with suspend /
// reactivate / revoke actions. Revoke is destructive (a revoked clone can no
// longer be cast) so it requires an inline confirm + reason.
//
// Postiz tokens only; the active badge uses the magenta AI accent (bg-ai).

import { FC, useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  useStudio,
  freshAvatarOnboarding,
} from '@gitroom/frontend/components/studio/studio.store';
import {
  listClones,
  setCloneStatus,
  revokeClone,
} from '@gitroom/frontend/components/studio/studio.clone-client';
import { CloneRecord, CloneStatus } from '@gitroom/frontend/components/studio/studio.types';

const STATUS_BADGE: Record<CloneStatus, string> = {
  active: 'bg-ai text-btnText',
  suspended: 'bg-btnSimple text-[var(--new-table-text)]',
  revoked: 'bg-red-500 text-white',
};

/** Returns an expiry note (warning/expired) or null for perpetual/healthy. */
function expiryNote(expires?: string): { text: string; tone: 'warn' | 'danger' } | null {
  if (!expires || expires === 'perpetual') return null;
  const ts = Date.parse(expires);
  if (Number.isNaN(ts)) return null;
  const days = Math.round((ts - Date.now()) / 86_400_000);
  if (days < 0) return { text: 'Consent expired', tone: 'danger' };
  if (days <= 30) return { text: `Consent expires in ${days}d`, tone: 'warn' };
  return null;
}

const Avatar: FC<{ clone: CloneRecord; onChanged: () => void }> = ({ clone, onChanged }) => {
  const [busy, setBusy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const thumb = clone.visual_identity?.reference_images?.[0];
  const voiceTier = clone.voice?.clone_tier;
  const exp = expiryNote(clone.consent_expires);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        onChanged();
      } catch (e: unknown) {
        setError((e as Error)?.message ?? String(e));
      } finally {
        setBusy(false);
      }
    },
    [onChanged]
  );

  return (
    <div className="flex flex-col gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[14px]">
      <div className="flex items-start gap-[12px]">
        <div className="w-[56px] h-[56px] shrink-0 rounded-[8px] bg-newBgColor border border-newBorder overflow-hidden flex items-center justify-center text-textItemBlur text-[11px]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={clone.person} className="w-full h-full object-cover" />
          ) : (
            'No image'
          )}
        </div>
        <div className="flex flex-col gap-[3px] min-w-0 flex-1">
          <div className="flex items-center gap-[8px]">
            <span className="text-[14px] font-[600] text-btnText truncate">{clone.person}</span>
            <span className={clsx('shrink-0 px-[8px] py-[2px] rounded-[6px] text-[10px] font-[600] uppercase tracking-[0.04em]', STATUS_BADGE[clone.status])}>
              {clone.status}
            </span>
          </div>
          <span className="text-[11px] text-textItemBlur font-mono truncate">{clone.clone_id}</span>
          <div className="flex items-center gap-[8px] text-[11px] text-textItemBlur">
            {voiceTier && <span className="px-[6px] py-[1px] rounded-[5px] bg-newBgColor border border-newBorder uppercase">{voiceTier} voice</span>}
            {clone.consent_type && <span>{clone.consent_type} consent</span>}
          </div>
        </div>
      </div>

      {/* Consent summary */}
      <div className="flex flex-col gap-[4px] text-[11px] text-textItemBlur leading-[1.4]">
        {clone.consent_channels && clone.consent_channels.length > 0 && (
          <span>Channels: {clone.consent_channels.join(', ')}</span>
        )}
        <span>Expires: {clone.consent_expires || 'perpetual'}</span>
        {exp && (
          <span className={exp.tone === 'danger' ? 'text-red-400' : 'text-amber-400'}>{exp.text}</span>
        )}
      </div>

      {error && <span className="text-[11px] text-red-400">{error}</span>}

      {/* Actions */}
      {clone.status === 'revoked' ? (
        <span className="text-[11px] text-textItemBlur italic">Revoked{clone.revoke_reason ? ` — ${clone.revoke_reason}` : ''}</span>
      ) : confirmingRevoke ? (
        <div className="flex flex-col gap-[8px]">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for revoking (recorded)"
            className="h-[36px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[12px] text-btnText"
          />
          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => revokeClone(clone.clone_id, reason || 'Revoked via Studio')).then(() => setConfirmingRevoke(false))}
              className="h-[36px] px-[12px] rounded-[8px] bg-red-500 text-white text-[12px] font-[600] disabled:opacity-50"
            >
              Confirm revoke
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setConfirmingRevoke(false); setReason(''); }}
              className="h-[36px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-[8px]">
          {clone.status === 'active' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setCloneStatus(clone.clone_id, 'suspended'))}
              className="h-[36px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50"
            >
              Suspend
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => setCloneStatus(clone.clone_id, 'active'))}
              className="h-[36px] px-[12px] rounded-[8px] bg-btnSimple text-btnText text-[12px] disabled:opacity-50"
            >
              Reactivate
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirmingRevoke(true)}
            className="h-[36px] px-[12px] rounded-[8px] border border-red-500/60 text-red-400 text-[12px] disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
      )}
    </div>
  );
};

export const StudioAvatarLibrary: FC = () => {
  const { state, dispatch } = useStudio();
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const clones = await listClones();
      dispatch({ type: 'SET_AVATARS', avatars: clones });
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
      dispatch({ type: 'SET_AVATARS', avatars: [] });
    }
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  const openOnboarding = () =>
    dispatch({ type: 'SET_AVATAR_ONBOARDING', onboarding: freshAvatarOnboarding() });

  if (error) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[20px] text-[13px] text-red-400">
        Could not load avatars: {error}{' '}
        <button type="button" onClick={load} className="underline text-btnText">Retry</button>
      </div>
    );
  }

  if (state.avatars == null) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColorInner p-[20px] text-[13px] text-textItemBlur">
        Loading your avatar library…
      </div>
    );
  }

  if (state.avatars.length === 0) {
    return (
      <div className="flex flex-col gap-[10px]">
        <h3 className="text-[13px] font-[600] text-btnText">People (real-person clones)</h3>
        <div className="flex flex-col items-start gap-[12px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[20px]">
          <p className="text-[13px] text-textItemBlur leading-[1.5] max-w-[460px]">
            No real-person clones yet. Clone a person to reuse their likeness and voice across
            commercials — you’ll record consent first, then add likeness images and voice samples.
          </p>
          <button
            type="button"
            onClick={openOnboarding}
            className="h-[40px] px-[16px] rounded-[8px] bg-ai text-btnText font-[600] text-[13px] hover:opacity-90 transition-opacity"
          >
            Clone a person
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[10px]">
      <h3 className="text-[13px] font-[600] text-btnText">People (real-person clones)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[12px]">
        {state.avatars.map((clone) => (
          <Avatar key={clone.clone_id} clone={clone} onChanged={load} />
        ))}
      </div>
    </div>
  );
};
