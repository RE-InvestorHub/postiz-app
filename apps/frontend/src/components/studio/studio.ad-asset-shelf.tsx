'use client';

// "From this ad" shelf — surfaces the ACTIVE ad's existing assets inside the
// generator tabs, filtered by type: image → Images, clip → Video, audio → Audio.
// Selecting a Campaign/Ad (in the Assets tab or the Project bar) sets activeAdId,
// and that ad's assets "cascade" into the matching tab here for reuse. Read-only
// (open in a new tab / play); linking new assets to the ad still happens via the
// generators' "+ Add to ad" + the Assets tab. Postiz tokens only.

import { FC, useEffect, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { getAdObjects, ResolvedObject, ObjectType } from '@gitroom/frontend/components/studio/studio.project-client';

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function thumbUrl(rec: any): string | null {
  if (!rec) return null;
  if (rec.path) return `${BRAIN_BASE.replace(/\/+$/, '')}/assets/${rec.path}`;
  if (rec.cdnUrl) return rec.cdnUrl;
  return null;
}

export const StudioAdAssetShelf: FC<{ objectType: ObjectType }> = ({ objectType }) => {
  const { state } = useStudio();
  const [objects, setObjects] = useState<ResolvedObject[]>([]);

  useEffect(() => {
    if (!state.activeAdId) { setObjects([]); return; }
    let live = true;
    getAdObjects(state.activeAdId)
      .then((o) => { if (live) setObjects(o.filter((x) => x.type === objectType)); })
      .catch(() => { if (live) setObjects([]); });
    return () => { live = false; };
  }, [state.activeAdId, objectType]);

  if (!state.activeAdId || objects.length === 0) return null;

  return (
    <div className="flex flex-col gap-[10px]">
      <div className="flex items-center gap-[10px]">
        <div className="flex-1 h-px bg-newBorder" />
        <span className="text-[11px] font-[500] text-textItemBlur uppercase tracking-[0.06em] shrink-0">from this ad</span>
        <div className="flex-1 h-px bg-newBorder" />
      </div>
      <div className="grid grid-cols-2 minCustom:grid-cols-3 gap-[10px]">
        {objects.map((o) => {
          const url = thumbUrl(o.record);
          const label = o.name || o.id;
          return (
            <div key={`${o.type}:${o.id}`} title={label}
              className="group rounded-[8px] overflow-hidden border border-newBorder bg-newBgColor flex flex-col hover:border-ai/60 transition-colors">
              {url && objectType === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="w-full aspect-square object-cover" /></a>
              ) : url && objectType === 'clip' ? (
                <video src={url} muted controls className="w-full aspect-square object-cover bg-black" />
              ) : url && objectType === 'audio' ? (
                <div className="w-full aspect-square flex items-center justify-center bg-newBgColorInner p-[10px]"><audio src={url} controls className="w-full" /></div>
              ) : (
                <div className="w-full aspect-square flex items-center justify-center text-textItemBlur text-[11px] uppercase">{o.type}</div>
              )}
              <span className="px-[8px] py-[6px] text-[11px] text-textItemBlur truncate">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StudioAdAssetShelf;
