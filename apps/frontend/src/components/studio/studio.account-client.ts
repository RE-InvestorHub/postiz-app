// Account transport — generation-provider credit balances for the Project bar.
// Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain). Thin transport only.

const BRAIN_BASE =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface ProviderCredits {
  connected: boolean;
  error?: string;
  // Higgsfield
  credits?: number;
  plan?: string | null;
  // Hedra + ElevenLabs share `remaining`
  remaining?: number;
  expiring?: number | null;
  // ElevenLabs (audio — TTS / multi-voice render / Voice Mirror)
  limit?: number;
  used?: number;
  resetAt?: number | null;
}

export interface CreditsResponse {
  higgsfield: ProviderCredits;
  hedra: ProviderCredits;
  elevenLabs?: ProviderCredits;
}

/** Read-only credit balances (Higgsfield + Hedra). Never throws on a provider error — the
 *  brain returns {connected:false} per provider; only a transport failure rejects. */
export async function getCredits(): Promise<CreditsResponse> {
  const res = await fetch(`${base()}/account/credits`, { headers: { 'content-type': 'application/json' } });
  if (!res.ok) throw new Error(`Brain ${res.status}`);
  return (await res.json()) as CreditsResponse;
}
