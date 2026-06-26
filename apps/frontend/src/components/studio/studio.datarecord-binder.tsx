'use client';

// Data-record binder — pick/create a vertical-agnostic data record, edit its fields,
// and choose which become data callouts. Resolves checked non-empty fields → callouts
// ({label,value}) and emits them to the parent composer (which merges with manual ones).
// The active record persists on the Ad (data_record_id). Postiz tokens.

import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { updateAd, getAd } from '@gitroom/frontend/components/studio/studio.project-client';
import {
  listDataRecords, listPresets, createFromPreset, setRecordField, removeRecordField,
  DataRecord, DataField,
} from '@gitroom/frontend/components/studio/studio.datarecord-client';

const inputCls = 'h-[32px] px-[8px] rounded-[8px] bg-newBgColorInner border border-newBorder text-[12px] text-btnText placeholder:text-textItemBlur';

export const StudioDataRecordBinder: FC<{
  adId: string | null;
  onCalloutsChange: (callouts: { label: string; value: string }[]) => void;
}> = ({ adId, onCalloutsChange }) => {
  const [records, setRecords] = useState<DataRecord[]>([]);
  const [presets, setPresets] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newKind, setNewKind] = useState('service');
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => records.find((r) => r.record_id === activeId) || null, [records, activeId]);

  // Resolve checked + non-empty fields → callouts, and bubble up whenever they change.
  useEffect(() => {
    const callouts = (active?.fields || []).filter((f) => selected.has(f.key) && f.value.trim()).map((f) => ({ label: f.label, value: f.value }));
    onCalloutsChange(callouts);
  }, [active, selected, onCalloutsChange]);

  const load = useCallback(async () => {
    if (!adId) return;
    try {
      const [recs, ps, ad] = await Promise.all([listDataRecords(), listPresets(), getAd(adId)]);
      setRecords(recs); setPresets(ps);
      const aid = ad?.data_record_id || '';
      setActiveId(aid);
      const rec = recs.find((r) => r.record_id === aid);
      if (rec) setSelected(new Set(rec.fields.filter((f) => f.value.trim()).map((f) => f.key)));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [adId]);
  useEffect(() => { void load(); }, [load]);

  const selectRecord = useCallback(async (id: string) => {
    setActiveId(id);
    const rec = records.find((r) => r.record_id === id);
    setSelected(new Set((rec?.fields || []).filter((f) => f.value.trim()).map((f) => f.key)));
    if (adId) { try { await updateAd(adId, { data_record_id: id || null }); } catch { /* non-fatal */ } }
  }, [records, adId]);

  const create = useCallback(async () => {
    try {
      const r = await createFromPreset({ name: `New ${newKind}`, kind: newKind });
      setRecords((cur) => [...cur, r]);
      await selectRecord(r.record_id);
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [newKind, selectRecord]);

  const patchField = useCallback(async (key: string, patch: Partial<DataField>) => {
    if (!activeId) return;
    try {
      const r = await setRecordField({ id: activeId, field: { key, ...patch } });
      setRecords((cur) => cur.map((x) => (x.record_id === r.record_id ? r : x)));
    } catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [activeId]);

  const addField = useCallback(async () => {
    if (!activeId) return;
    const label = `Field ${(active?.fields.length || 0) + 1}`;
    try { const r = await setRecordField({ id: activeId, field: { label, value: '' } }); setRecords((cur) => cur.map((x) => (x.record_id === r.record_id ? r : x))); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [activeId, active]);

  const dropField = useCallback(async (key: string) => {
    if (!activeId) return;
    try { const r = await removeRecordField({ id: activeId, key }); setRecords((cur) => cur.map((x) => (x.record_id === r.record_id ? r : x))); setSelected((s) => { const n = new Set(s); n.delete(key); return n; }); }
    catch (e) { setError((e as Error)?.message ?? String(e)); }
  }, [activeId]);

  const toggle = (key: string) => setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className="flex flex-col gap-[8px] rounded-[8px] border border-newBorder bg-newBgColorInner p-[10px]">
      <div className="flex flex-wrap items-end gap-[8px]">
        <label className="flex flex-col gap-[4px]">
          <span className="text-[11px] font-[600] text-textItemBlur uppercase tracking-[0.05em]">Data record</span>
          <select value={activeId} onChange={(e) => selectRecord(e.target.value)} className={inputCls + ' h-[36px]'}>
            <option value="">None (manual callouts)</option>
            {records.map((r) => (<option key={r.record_id} value={r.record_id}>{r.name} · {r.kind}</option>))}
          </select>
        </label>
        <div className="flex items-end gap-[4px] ml-auto">
          <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className={inputCls + ' h-[36px]'} title="New record from a preset">
            {presets.map((p) => (<option key={p} value={p}>{p}</option>))}
          </select>
          <button type="button" onClick={create} className="h-[36px] px-[12px] rounded-[8px] border border-newBorder text-btnText text-[12px] font-[600]">+ New record</button>
        </div>
      </div>

      {active && (
        <div className="flex flex-col gap-[5px]">
          <span className="text-[11px] text-textItemBlur">Check fields to show as callouts; edit values inline.</span>
          {active.fields.map((f) => (
            <div key={f.key} className="flex items-center gap-[6px]">
              <input type="checkbox" checked={selected.has(f.key)} onChange={() => toggle(f.key)} title="Show as callout" />
              <input value={f.label} onChange={(e) => patchField(f.key, { label: e.target.value })} className={`${inputCls} w-[120px]`} placeholder="Label" />
              <input value={f.value} onChange={(e) => patchField(f.key, { value: e.target.value })} className={`${inputCls} flex-1`} placeholder="Value (per-listing)" />
              <button type="button" onClick={() => dropField(f.key)} className="text-[11px] text-[#ff7eb6] hover:underline shrink-0">remove</button>
            </div>
          ))}
          <button type="button" onClick={addField} className="self-start h-[28px] px-[10px] rounded-[8px] border border-newBorder text-btnText text-[11px] font-[600]">+ Add field</button>
        </div>
      )}
      {error && <div className="text-[11px] text-red-400">{error}</div>}
    </div>
  );
};
