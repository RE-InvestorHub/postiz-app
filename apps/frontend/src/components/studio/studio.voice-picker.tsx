'use client';

// Voice picker — a <select> over the unified voice library (GET /voices/library),
// grouped by source (Brand / Clones / ElevenLabs). Not-ready voices (e.g. a PVC
// clone still training) render disabled. Presentational + transport only.
//
// Postiz tokens only.

import { FC, useEffect, useState } from 'react';
import {
  listVoiceLibrary,
  VoiceOption,
} from '@gitroom/frontend/components/studio/studio.voice-client';

interface Props {
  value: string;
  onChange: (voiceId: string) => void;
  /** Surface load errors to the parent (optional). */
  onError?: (msg: string) => void;
  /** Casting mode: allow an empty selection (falls back to the house/brand voice) + no auto-default. */
  allowEmpty?: boolean;
  /** Label for the empty option when allowEmpty is set. */
  emptyLabel?: string;
  /** Override the select classes (e.g. a compact casting-column picker). */
  className?: string;
}

const selectCls =
  'h-[40px] px-[10px] rounded-[8px] bg-newBgColor border border-newBorder text-[13px] text-btnText min-w-[240px]';

const GROUPS: { source: VoiceOption['source']; label: string }[] = [
  { source: 'brand', label: 'Brand' },
  { source: 'clone', label: 'Clones' },
  { source: 'elevenlabs', label: 'ElevenLabs' },
];

export const StudioVoicePicker: FC<Props> = ({ value, onChange, onError, allowEmpty, emptyLabel, className }) => {
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listVoiceLibrary()
      .then((list) => {
        if (!live) return;
        setVoices(list);
        // Default to the first ready voice (brand) if nothing is selected — but NOT in casting mode,
        // where an empty selection is a valid "use the house/brand voice" choice.
        if (!value && !allowEmpty) {
          const first = list.find((v) => v.ready);
          if (first) onChange(first.voiceId);
        }
      })
      .catch((e: unknown) => {
        const msg = (e as Error)?.message ?? String(e);
        if (!live) return;
        setError(msg);
        onError?.(msg);
        setVoices([]);
      });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <span className="text-[12px] text-red-400">Could not load voices: {error}</span>;
  }

  return (
    <select
      className={className ?? selectCls}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={!voices}
    >
      {!voices && <option>Loading voices…</option>}
      {voices && allowEmpty && <option value="">{emptyLabel ?? 'House voice'}</option>}
      {voices && voices.length === 0 && !allowEmpty && <option value="">No voices available</option>}
      {voices &&
        GROUPS.map(({ source, label }) => {
          const group = voices.filter((v) => v.source === source);
          if (group.length === 0) return null;
          return (
            <optgroup key={source} label={label}>
              {group.map((v) => (
                <option key={v.voiceId} value={v.voiceId} disabled={!v.ready}>
                  {v.label}
                  {v.tier ? ` · ${v.tier.toUpperCase()}` : ''}
                  {v.ready ? '' : ' · not ready'}
                </option>
              ))}
            </optgroup>
          );
        })}
    </select>
  );
};
