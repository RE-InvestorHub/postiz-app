// Data-record client — transport for vertical-agnostic structured data records
// (data-bound supers). Same-origin via NEXT_PUBLIC_BRAIN_URL (/api/brain).

const BRAIN_BASE = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BRAIN_URL) || '/api/brain';
function base(): string { return BRAIN_BASE.replace(/\/+$/, ''); }

export interface DataField { key: string; label: string; value: string }
export interface DataRecord { record_id: string; name: string; kind: string; fields: DataField[] }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try { res = await fetch(`${base()}${path}`, { headers: { 'content-type': 'application/json' }, ...init }); }
  catch (err: unknown) { throw new Error(`Could not reach the data service: ${(err as Error)?.message ?? String(err)}`); }
  if (!res.ok) { const d = await res.text().catch(() => ''); throw new Error(`Data service responded ${res.status}${d ? `: ${d}` : ''}`); }
  return (await res.json().catch(() => ({}))) as T;
}

export function listDataRecords(): Promise<DataRecord[]> { return req<DataRecord[]>('/datarecords'); }
export function listPresets(): Promise<string[]> { return req<string[]>('/datarecords/presets'); }
export function getDataRecord(id: string): Promise<DataRecord> { return req<DataRecord>(`/datarecords/${encodeURIComponent(id)}`); }
export function createFromPreset(payload: { name: string; kind: string }): Promise<DataRecord> {
  return req<DataRecord>('/datarecords/createFromPreset', { method: 'POST', body: JSON.stringify(payload) });
}
export function setRecordField(payload: { id: string; field: Partial<DataField> }): Promise<DataRecord> {
  return req<DataRecord>('/datarecords/setField', { method: 'POST', body: JSON.stringify(payload) });
}
export function removeRecordField(payload: { id: string; key: string }): Promise<DataRecord> {
  return req<DataRecord>('/datarecords/removeField', { method: 'POST', body: JSON.stringify(payload) });
}
export function deleteDataRecord(id: string): Promise<{ ok: boolean }> {
  return req<{ ok: boolean }>('/datarecords/delete', { method: 'POST', body: JSON.stringify({ id }) });
}
