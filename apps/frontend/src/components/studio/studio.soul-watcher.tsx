'use client';

// Global Soul-training watcher — mounted once at the Studio shell so a long Soul training (~8–15
// min, server-side) is NOTIFIED on completion no matter which tab the user is on, and even across a
// page reload. It tracks every character anchor in `soul_status: 'training'` (seeded on mount from
// the anchor list + topped up by `reinvestorhub:soul-training-started` events), polls each, and
// toasts when one flips to ready/failed — then fires `reinvestorhub:soul-refresh` so any visible
// Soul pill/badge updates. Renders nothing.

import { FC, useEffect, useRef } from 'react';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { listAnchors } from '@gitroom/frontend/components/studio/studio.previs-client';
import { getSoulStatus } from '@gitroom/frontend/components/studio/studio.director-client';

export const SoulTrainingWatcher: FC = () => {
  const toaster = useToaster();
  // anchorId -> display name, for anchors we're currently waiting on.
  const watching = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let alive = true;

    // Seed from persisted state so a reload (or starting elsewhere) still gets the completion toast.
    listAnchors().then((anchors) => {
      for (const a of anchors) if (a.soul_status === 'training') watching.current.set(a.anchor_id, a.name);
    }).catch(() => {});

    // A freshly-kicked training registers itself here.
    const onStart = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.anchorId) watching.current.set(d.anchorId, d.name || 'this character');
    };
    if (typeof window !== 'undefined') window.addEventListener('reinvestorhub:soul-training-started', onStart as EventListener);

    const tick = async () => {
      const ids = [...watching.current.keys()];
      for (const anchorId of ids) {
        try {
          const s = await getSoulStatus(anchorId);
          if (s.soul_status === 'ready') {
            const name = watching.current.get(anchorId) || 'A character';
            watching.current.delete(anchorId);
            toaster.show(`✨ Soul ready — ${name} is identity-locked. New Scene Director shots of this character now use it automatically.`, 'success');
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('reinvestorhub:soul-refresh'));
              window.dispatchEvent(new CustomEvent('reinvestorhub:credits-refresh'));
            }
          } else if (s.soul_status === 'failed') {
            const name = watching.current.get(anchorId) || 'A character';
            watching.current.delete(anchorId);
            toaster.show(`Soul training failed for ${name}. You can try promoting it again.`, 'warning');
            if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('reinvestorhub:soul-refresh'));
          }
        } catch { /* transient; retry next tick */ }
      }
    };
    const interval = setInterval(() => { if (alive) void tick(); }, 20_000);

    return () => {
      alive = false;
      clearInterval(interval);
      if (typeof window !== 'undefined') window.removeEventListener('reinvestorhub:soul-training-started', onStart as EventListener);
    };
  }, [toaster]);

  return null;
};
