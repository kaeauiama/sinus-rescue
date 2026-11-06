import type { LogEvent } from '../../../platform/events';
import { countedSessionOn } from '../../hum/domain/history';

export const KIND_ROUTINE = 'routine';
export const SETTING_ROUTINE = 'daily.routine';
export const SETTING_STARTED = 'daily.startedDay';

export type RoutineSlot = 'morning' | 'night';
export type RoutineType = 'rinse' | 'hum' | 'steroid' | 'decongestant' | 'other';
export type RinseReturn = 'none' | 'clear' | 'yellow' | 'green' | 'blood';

export const SLOT_LABELS: Record<RoutineSlot, string> = { morning: '朝', night: '夜' };

export const RINSE_RETURNS: { id: RinseReturn; label: string }[] = [
  { id: 'none', label: 'なし' },
  { id: 'clear', label: '透明' },
  { id: 'yellow', label: '黄' },
  { id: 'green', label: '緑' },
  { id: 'blood', label: '血' },
];

export interface RoutineItem {
  id: string;
  label: string;
  slot: RoutineSlot;
  type: RoutineType;
  streak: boolean;
}

// 点鼻薬は全員が使うものではないので、使い始めたときに追加する。
export const DEFAULT_ROUTINE: RoutineItem[] = [
  { id: 'rinse-morning', label: '洗浄', slot: 'morning', type: 'rinse', streak: true },
  { id: 'rinse-night', label: '洗浄', slot: 'night', type: 'rinse', streak: true },
  { id: 'hum', label: 'ハミング', slot: 'night', type: 'hum', streak: false },
];

export interface RoutineRecord {
  itemId: string;
  itemType: RoutineType;
  done: boolean;
  rinseReturn?: RinseReturn;
}

export function routineItems(stored: unknown): RoutineItem[] {
  return (stored as RoutineItem[] | undefined) ?? DEFAULT_ROUTINE;
}

const DAILY_KINDS = ['routine', 'symptom', 'tag', 'weekly'];

// 遡って入力した日や読み込んだ記録も集計に入るよう、最も古い記録まで開始日を広げる。
export function firstRecordedDay(events: LogEvent[], started: unknown, today: string): string {
  const stored = (started as string | undefined) ?? today;
  return events.reduce((first, e) => (DAILY_KINDS.includes(e.kind) && e.day < first ? e.day : first), stored);
}

export function checksOn(events: LogEvent[], day: string): Map<string, RoutineRecord> {
  const checks = new Map<string, RoutineRecord>();
  for (const event of events) {
    if (event.kind === KIND_ROUTINE && event.day === day) {
      const record = event.payload as RoutineRecord;
      checks.set(record.itemId, record);
    }
  }
  return checks;
}

// ハミングの記録を読むだけで、ハミング側には書き込まない。
export const humSessionOn = countedSessionOn;

export function isDone(item: RoutineItem, checks: Map<string, RoutineRecord>, events: LogEvent[], day: string): boolean {
  if (checks.get(item.id)?.done) return true;
  return item.type === 'hum' && humSessionOn(events, day);
}
