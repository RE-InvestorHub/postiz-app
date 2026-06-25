'use client';

// Project tab — shows what's inside the ACTIVE Ad: the objects (project-agnostic
// asset references) added to it. Answers "where did my asset go?". Thumbnails for
// image/clip; remove unlinks the reference (never deletes the asset). Postiz tokens.

import { FC, useCallback, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, removeObject, ResolvedObject } from '@gitroom/frontend/components/studio/studio.project-client';

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';

// Resolve a viewable URL for an object's record (manifest). Prefer the local
// /assets path via the brain proxy; fall back to the Higgsfield CDN url.
function thumbUrl(rec: any): string | null {
  if (!rec) return null;
  if (rec.path) return `${BRAIN_BASE.replace(/\/+$/, '')}/assets/${rec.path}`;
  if (rec.cdnUrl) return rec.cdnUrl;
  return null;
}

export const StudioProjectPanel: FC = () => {
  const { state } = useStudio();
  const [objects, setObjects] = useState<ResolvedObject[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!state.activeAdId) { setObjects([]); return; }
    setBusy(true); setError(null);
    try { setObjects(await getAdObjects(state.activeAdId)); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(false); }
  }, [state.activeAdId]);
  useEffect(() => { void load(); }, [load]);

  const doRemove = useCallback(async (o: ResolvedObject) => {
    if (!state.activeAdId) return;
    try { await removeObject({ adId: state.activeAdId, type: o.type, id: o.id }); await load(); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [state.activeAdId, load]);

  if (!state.activeCampaignId || !state.activeAdId) {
    return (
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[24px] text-center text-[13px] text-textItemBlur">
        Select a <span className="text-btnText font-[600]">Campaign</span> and an{' '}
        <span className="text-btnText font-[600]">Ad</span> in the Project bar above, then add assets
        to it from any generator. They'll appear here.
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
      <div className="flex items-center gap-[10px]">
        <span className="text-[14px] font-[600] text-btnText">Ad contents</span>
        <span className="text-[12px] text-textItemBlur">{objects.length} object{objects.length === 1 ? '' : 's'}</span>
        <button type="button" onClick={load} disabled={busy}
          className="ml-auto h-[32px] px-[12px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600] disabled:opacity-50">
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="text-[12px] text-red-400">{error}</div>}

      {objects.length === 0 && !busy && (
        <div className="text-[13px] text-textItemBlur py-[12px]">
          Nothing added yet. Generate in Images/Video/Audio (or capture a character), then click
          <span className="text-btnText font-[600]"> + Add to ad</span>.
        </div>
      )}

      {objects.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[12px]">
          {objects.map((o) => {
            const url = thumbUrl(o.record);
            return (
              <div key={`${o.type}:${o.id}`} className="rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner flex flex-col">
                {url && (o.type === 'image') ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={o.id} className="w-full aspect-square object-cover" />
                ) : url && (o.type === 'clip') ? (
                  <video src={url} muted className="w-full aspect-square object-cover" />
                ) : (
                  <div className="w-full aspect-square flex items-center justify-center text-[12px] text-textItemBlur uppercase">{o.type}</div>
                )}
                <div className="p-[8px] flex items-center gap-[6px]">
                  <span className="text-[11px] text-textItemBlur truncate flex-1">{o.type} · {o.id}</span>
                  <button type="button" onClick={() => doRemove(o)}
                    className="text-[11px] text-[#ff7eb6] hover:underline shrink-0">remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
