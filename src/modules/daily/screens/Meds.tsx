import { useState } from 'preact/hooks';
import { dayLabel, logicalDay } from '../../../platform/events';
import { Btn, Group, ListRow, Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import {
  KIND_MED,
  KIND_VISIT,
  MED_TYPES,
  medList,
  routineItemForMed,
  visitList,
  type Med,
  type MedRecord,
  type MedType,
  type VisitRecord,
} from '../domain/meds';
import { SETTING_ROUTINE } from '../domain/routine';

type Mode = 'list' | 'addMed' | 'addVisit';

const inputValue = (event: Event) => (event.currentTarget as HTMLInputElement).value;

// 開始日と終了日だけを記録する。薬について提案はしない(HC-2)。
export function Meds() {
  const { events, items, append, setSetting, go } = useDaily();
  const today = logicalDay(new Date());
  const [mode, setMode] = useState<Mode>('list');
  const [medType, setMedType] = useState<MedType>('steroid');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(today);
  const [memo, setMemo] = useState('');
  const meds = medList(events);
  const visits = visitList(events);

  const open = (next: Mode) => {
    setLabel('');
    setMemo('');
    setDate(today);
    setMode(next);
  };

  const addMed = async () => {
    const medId = crypto.randomUUID();
    const name = label.trim() || (MED_TYPES.find((t) => t.id === medType)?.label ?? '薬');
    await append<MedRecord>(KIND_MED, { medId, medType, label: name, action: 'start', date });
    const item = routineItemForMed({ medId, medType, label: name });
    if (item) await setSetting(SETTING_ROUTINE, [...items, item]);
    setMode('list');
  };

  const stopMed = async (med: Med) => {
    await append<MedRecord>(KIND_MED, { medId: med.medId, medType: med.medType, label: med.label, action: 'stop', date: today });
    await setSetting(SETTING_ROUTINE, items.filter((item) => item.id !== `med-${med.medId}`));
  };

  const addVisit = async () => {
    await append<VisitRecord>(KIND_VISIT, { date, memo: memo.trim() });
    setMode('list');
  };

  if (mode === 'addMed') {
    const selected = MED_TYPES.find((t) => t.id === medType);
    return (
      <Screen
        title="使い始めた薬"
        align="top"
        onClose={() => setMode('list')}
        closeLabel="戻る"
        actions={
          <Btn primary onClick={addMed}>
            記録する
          </Btn>
        }
      >
        <div class="chips spaced">
          {MED_TYPES.map((type) => (
            <button
              type="button"
              key={type.id}
              class={`chip ${medType === type.id ? 'chip-active' : ''}`}
              aria-pressed={medType === type.id}
              onClick={() => setMedType(type.id)}
            >
              {type.label}
            </button>
          ))}
        </div>
        {selected?.note && <p class="note">{selected.note}</p>}
        <label class="field">
          名前(任意)
          <input type="text" value={label} onInput={(e) => setLabel(inputValue(e))} />
        </label>
        <label class="field">
          開始日
          <input type="date" value={date} max={today} onInput={(e) => setDate(inputValue(e))} />
        </label>
      </Screen>
    );
  }

  if (mode === 'addVisit') {
    return (
      <Screen
        title="受診の記録"
        align="top"
        onClose={() => setMode('list')}
        closeLabel="戻る"
        actions={
          <Btn primary onClick={addVisit}>
            記録する
          </Btn>
        }
      >
        <label class="field">
          日付
          <input type="date" value={date} max={today} onInput={(e) => setDate(inputValue(e))} />
        </label>
        <label class="field">
          メモ(任意)
          <input type="text" value={memo} onInput={(e) => setMemo(inputValue(e))} />
        </label>
      </Screen>
    );
  }

  return (
    <Screen title="薬と受診" align="top" onClose={() => go({ name: 'today' })} closeLabel="戻る">
      <Group title="薬">
        {meds.length === 0 && <p class="card-empty">まだ記録はありません。</p>}
        {meds.map((med) => (
          <div key={med.medId} class={`item-row ${med.end ? 'off' : ''}`}>
            <span class="list-main">
              <span>{med.label}</span>
              <small>{`${dayLabel(med.start)} 〜 ${med.end ? dayLabel(med.end) : '使用中'}`}</small>
            </span>
            {!med.end && (
              <button type="button" class="pill" onClick={() => stopMed(med)}>
                終わった
              </button>
            )}
          </div>
        ))}
        <ListRow icon="plus" tone="amber" label="使い始めた薬を記録する" onClick={() => open('addMed')} />
      </Group>

      <Group title="受診">
        {visits.length === 0 && <p class="card-empty">まだ記録はありません。</p>}
        {visits.map((visit, index) => (
          <div key={`${visit.date}-${index}`} class="item-row">
            <span class="list-main">
              <span>{dayLabel(visit.date)}</span>
              {visit.memo && <small>{visit.memo}</small>}
            </span>
          </div>
        ))}
        <ListRow icon="plus" tone="indigo" label="受診を記録する" onClick={() => open('addVisit')} />
      </Group>

      <Group title="受診サマリ">
        <ListRow icon="file" tone="teal" label="経過を1枚にまとめる" onClick={() => go({ name: 'summary' })} />
      </Group>
    </Screen>
  );
}
