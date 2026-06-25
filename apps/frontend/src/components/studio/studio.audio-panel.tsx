'use client';

// Audio tab — voice-over generation. Pick a voice from the library (brand / clone /
// ElevenLabs), type a script, Generate VO → real TTS (POST /studio/audio) → a
// playable audio asset that the Remotion editor (inputMediaUrl) and the pipeline
// audio leg can use as a video's narration track.
//
// Postiz tokens only; magenta bg-ai for the generate CTA. Draft-by-default.

import { FC, useCallback, useState } from 'react';
import { useStudio } from '@gitroom/frontend/components/studio/studio.store';
import { StudioVoicePicker } from '@gitroom/frontend/components/studio/studio.voice-picker';
import { generateVO } from '@gitroom/frontend/components/studio/studio.voice-client';
import { StudioResult } from '@gitroom/frontend/components/studio/studio.types';

const IconWave: FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 10v3" /><path d="M6 6v11" /><path d="M10 3v18" /><path d="M14 8v7" /><path d="M18 5v13" /><path d="M22 10v3" />
  </svg>
);

export const StudioAudioPanel: FC = () => {
  const { state, dispatch } = useStudio();
  const [voiceId, setVoiceId] = useState('');
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioResults = state.results.filter((r) => r.tab === 'audio');

  const generate = useCallback(async () => {
    if (!voiceId || !script.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const vo = await generateVO({ text: script, voiceId });
      const result: StudioResult = {
        id: vo.id,
        url: vo.url,
        tab: 'audio',
        prompt: script.slice(0, 80),
        createdAt: Date.now(),
      };
      dispatch({ type: 'ADD_RESULT', result });
    } catch (e: unknown) {
      setError((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }, [voiceId, script, dispatch]);

  return (
    <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
      <div className="flex items-center gap-[8px]">
        <span className="w-[28px] h-[28px] rounded-[8px] bg-ai/15 text-ai flex items-center justify-center"><IconWave /></span>
        <span className="text-[14px] font-[600] text-btnText">Generate voice-over</span>
      </div>
      <p className="text-[12px] text-textItemBlur leading-[1.5]">
        Pick a voice and a script. The generated VO becomes an audio asset you can use as a
        video’s narration track in the editor.
      </p>

      <textarea
        value={script}
        onChange={(e) => setScript(e.target.value)}
        placeholder="Script for the voice-over…"
        rows={3}
        className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y"
      />

      <div className="flex flex-wrap items-center gap-[10px]">
        <StudioVoicePicker value={voiceId} onChange={setVoiceId} onError={setError} />
        <button
          type="button"
          disabled={busy || !voiceId || !script.trim()}
          onClick={generate}
          className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] disabled:opacity-50 disabled:cursor-not-allowed ml-auto"
        >
          {busy ? 'Generating…' : 'Generate VO'}
        </button>
      </div>

      {error && <div className="text-[12px] text-red-400 leading-[1.4]">{error}</div>}

      {audioResults.length > 0 && (
        <div className="flex flex-col gap-[10px]">
          <span className="text-[13px] font-[600] text-btnText">Generated voice-overs</span>
          {audioResults.map((r) => (
            <div key={r.id} className="flex flex-col gap-[4px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
              <span className="text-[11px] text-textItemBlur truncate">{r.prompt}</span>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={r.url} controls className="w-full h-[36px]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
