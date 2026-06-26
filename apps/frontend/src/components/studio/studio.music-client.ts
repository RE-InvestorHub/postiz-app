// Music-bed client — transport for the Composer's background-music library.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Beds are keyed by mood + BPM;
// the brain seeds built-in placeholders and serves them at /music/beds.

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface MusicBed {
  id: string;
  file: string;
  mood: string;
  bpm: number;
  durationS: number;
  builtin?: boolean;
}

export async function listMusicBeds(): Promise<MusicBed[]> {
  let res: Response;
  try { res = await fetch(`${base()}/music/beds`, { headers: { 'content-type': 'application/json' } }); }
  catch (err: unknown) { throw new Error(`Could not reach the music service: ${(err as Error)?.message ?? String(err)}`); }
  if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Music service responded ${res.status}${d ? `: ${d}` : ''}`); }
  return (await res.json().catch(() => [])) as MusicBed[];
}
