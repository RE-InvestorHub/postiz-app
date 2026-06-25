'use client';

// Storyboard tab — synthetic-character previs board.
// Loop: prompt → Generate → board → Capture a liked frame as a reusable character
// anchor → Restage that exact character into new scenes/styles. Capture/Save are
// manual curation (purple bg-btnPrimary); Generate/Restage are AI (magenta bg-ai).
// Postiz tokens only. Backend: /studio/generate + /previs/* (see studio.previs-client).

import { FC, useCallback, useEffect, useState } from 'react';
import {
  generateImage,
  captureCharacter,
  restage,
  saveLookRef,
  listAnchors,
  jobIdFromUrl,
  CharacterAnchor,
  LookRefKind,
} from '@gitroom/frontend/components/studio/studio.previs-client';

interface BoardItem {
  id: string;
  url: string;
  cdnUrl: string;
  prompt: string;
  kind: 'gen' | 'restage';
}

const LOOK_KINDS: LookRefKind[] = ['lighting', 'style', 'environment', 'palette', 'lens'];

export const StudioPrevisPanel: FC = () => {
  const [prompt, setPrompt] = useState('');
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [anchors, setAnchors] = useState<CharacterAnchor[]>([]);
  const [selectedAnchor, setSelectedAnchor] = useState<string>('');
  const [scenePrompt, setScenePrompt] = useState('');
  const [lookKind, setLookKind] = useState<LookRefKind>('style');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshAnchors = useCallback(async () => {
    try { setAnchors(await listAnchors('synthetic')); } catch (e) { /* non-fatal */ }
  }, []);
  useEffect(() => { void refreshAnchors(); }, [refreshAnchors]);

  const doGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setBusy('generate'); setError(null);
    try {
      const g = await generateImage({ prompt, model: 'nano_banana_2' });
      setBoard((b) => [{ id: g.id, url: g.url, cdnUrl: g.cdnUrl, prompt, kind: 'gen' }, ...b]);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [prompt]);

  const doCapture = useCallback(async (item: BoardItem) => {
    const jobId = jobIdFromUrl(item.cdnUrl);
    if (!jobId) { setError('Could not read a Higgsfield job-id from this image.'); return; }
    setBusy(item.id); setError(null);
    try {
      await captureCharacter({ jobId, name: item.prompt.slice(0, 40), descriptor: item.prompt });
      await refreshAnchors();
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [refreshAnchors]);

  const doSaveLook = useCallback(async (item: BoardItem) => {
    setBusy(item.id); setError(null);
    try {
      const jobId = jobIdFromUrl(item.cdnUrl);
      await saveLookRef({ kind: lookKind, descriptor: item.prompt, referenceImages: jobId ? [jobId] : [] });
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [lookKind]);

  const doRestage = useCallback(async () => {
    if (!selectedAnchor || !scenePrompt.trim()) return;
    setBusy('restage'); setError(null);
    try {
      const r = await restage({ anchorId: selectedAnchor, scenePrompt });
      setBoard((b) => [{ id: r.id, url: r.url, cdnUrl: r.cdnUrl, prompt: scenePrompt, kind: 'restage' }, ...b]);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
    finally { setBusy(null); }
  }, [selectedAnchor, scenePrompt]);

  return (
    <div className="flex flex-col gap-[14px]">
      {/* Generate */}
      <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
        <span className="text-[14px] font-[600] text-btnText">Generate a character or scene</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe a character (e.g. a weathered brass robot street-musician, neutral studio background)…"
          rows={3}
          className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y"
        />
        <button type="button" disabled={busy === 'generate' || !prompt.trim()} onClick={doGenerate}
          className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] disabled:opacity-50 ml-auto">
          {busy === 'generate' ? 'Generating…' : '✨ Generate'}
        </button>
      </div>

      {error && <div className="text-[12px] text-red-400 leading-[1.4]">{error}</div>}

      {/* Restage (only when at least one character is captured) */}
      {anchors.length > 0 && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[12px]">
          <span className="text-[14px] font-[600] text-btnText">Restage a captured character</span>
          <div className="flex flex-wrap items-center gap-[10px]">
            <select value={selectedAnchor} onChange={(e) => setSelectedAnchor(e.target.value)}
              className="h-[40px] px-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText">
              <option value="">Choose character…</option>
              {anchors.map((a) => <option key={a.anchor_id} value={a.anchor_id}>{a.name}{a.soul_id ? ' (Soul ID)' : ''}</option>)}
            </select>
          </div>
          <textarea value={scenePrompt} onChange={(e) => setScenePrompt(e.target.value)}
            placeholder="New scene / style / lighting (e.g. as a cyberpunk real-estate agent in a neon high-rise)…"
            rows={2}
            className="w-full p-[12px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[13px] text-btnText placeholder:text-textItemBlur resize-y" />
          <button type="button" disabled={busy === 'restage' || !selectedAnchor || !scenePrompt.trim()} onClick={doRestage}
            className="h-[40px] px-[18px] rounded-[8px] bg-ai text-btnText font-[600] disabled:opacity-50 ml-auto">
            {busy === 'restage' ? 'Restaging…' : '✨ Restage'}
          </button>
        </div>
      )}

      {/* Board */}
      {board.length > 0 && (
        <div className="rounded-[8px] border border-newBorder bg-newBgColor p-[16px] flex flex-col gap-[10px]">
          <div className="flex items-center gap-[10px]">
            <span className="text-[14px] font-[600] text-btnText">Board</span>
            <select value={lookKind} onChange={(e) => setLookKind(e.target.value as LookRefKind)}
              className="ml-auto h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText">
              {LOOK_KINDS.map((k) => <option key={k} value={k}>look: {k}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-[12px]">
            {board.map((item) => (
              <div key={item.id} className="rounded-[8px] overflow-hidden border border-newBorder bg-newBgColorInner flex flex-col">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt={item.prompt} className="w-full aspect-square object-cover" />
                <div className="p-[8px] flex flex-col gap-[6px]">
                  <span className="text-[11px] text-textItemBlur truncate">{item.kind === 'restage' ? '↻ ' : ''}{item.prompt}</span>
                  <div className="flex gap-[6px]">
                    <button type="button" disabled={busy === item.id} onClick={() => doCapture(item)}
                      className="flex-1 h-[32px] rounded-[8px] bg-btnPrimary text-btnText text-[12px] font-[600] disabled:opacity-50">
                      {busy === item.id ? '…' : 'Capture'}
                    </button>
                    <button type="button" disabled={busy === item.id} onClick={() => doSaveLook(item)}
                      className="flex-1 h-[32px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600] disabled:opacity-50">
                      Save look
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
