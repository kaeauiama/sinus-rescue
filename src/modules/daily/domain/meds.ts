import type { LogEvent } from '../../../platform/events';
import type { RoutineItem } from './routine';

export const KIND_MED = 'med';
export const KIND_VISIT = 'visit';

export type MedType = 'steroid' | 'decongestant' | 'antibiotic' | 'other';

export const MED_TYPES: { id: MedType; label: string; note?: string }[] = [
  { id: 'steroid', label: 'ステロイド点鼻' },
  { id: 'decongestant', label: '血管収縮点鼻', note: '継続には数えず、連続の日数を表示します' },
  { id: 'antibiotic', label: '抗菌薬' },
  { id: 'other', label: 'その他' },
];

export interface MedRecord {
  medId: string;
  medType: MedType;
  label: string;
  action: 'start' | 'stop';
  date: string;
}

export interface VisitRecord {
  date: string;
  memo: string;
}

export interface Med {
  medId: string;
  medType: MedType;
  label: string;
  start: string;
  end: string | null;
}

export function medList(events: LogEvent[]): Med[] {
  const meds = new Map<string, Med>();
  for (const event of events) {
    if (event.kind !== KIND_MED) continue;
    const record = event.payload as MedRecord;
    if (record.action === 'start') {
      meds.set(record.medId, { medId: record.medId, medType: record.medType, label: record.label, start: record.date, end: null });
    } else {
      const med = meds.get(record.medId);
      if (med) med.end = record.date;
    }
  }
  return [...meds.values()].sort((a, b) => (a.start < b.start ? 1 : -1));
}

export function visitList(events: LogEvent[]): VisitRecord[] {
  return events
    .filter((e) => e.kind === KIND_VISIT)
    .map((e) => e.payload as VisitRecord)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export const medActiveOn = (med: Med, day: string) => med.start <= day && (med.end == null || day <= med.end);

// 点鼻薬だけ毎日のチェック項目にする。血管収縮薬は継続の対象にしない(HC-4)。
export function routineItemForMed(med: { medId: string; medType: MedType; label: string }): RoutineItem | null {
  if (med.medType !== 'steroid' && med.medType !== 'decongestant') return null;
  return { id: `med-${med.medId}`, label: med.label, slot: 'morning', type: med.medType, streak: med.medType === 'steroid' };
}
