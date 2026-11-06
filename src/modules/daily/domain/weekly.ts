import { addDays, dayDiff, latestOn, type LogEvent } from '../../../platform/events';
import { WEEKLY_INTERVAL_DAYS } from '../rules';

export const KIND_WEEKLY = 'weekly';
export const SETTING_SCENT = 'daily.scent';

export type SmellResult = 'clear' | 'faint' | 'none';

export const SMELL_RESULTS: { id: SmellResult; label: string }[] = [
  { id: 'clear', label: 'はっきりわかる' },
  { id: 'faint', label: '少しわかる' },
  { id: 'none', label: 'わからない' },
];

export const SCENTS = ['コーヒー', 'ミント', '石けん'];

export interface WeeklyRecord {
  change: number;
  scent: string | null;
  smell: SmellResult | null;
  cleaned: boolean | null;
}

export const weeklyOn = (events: LogEvent[], day: string) => latestOn<WeeklyRecord>(events, KIND_WEEKLY, day);

// 前回の振り返り、または使い始めてから1週間たったら案内する。
export function weeklyDue(events: LogEvent[], today: string, startedDay: string): boolean {
  const last = events.findLast((e) => e.kind === KIND_WEEKLY)?.day ?? startedDay;
  return dayDiff(last, today) >= WEEKLY_INTERVAL_DAYS;
}

export function weeklyChanges(events: LogEvent[], today: string, days: number): { day: string; change: number }[] {
  const from = addDays(today, -days + 1);
  return events
    .filter((e) => e.kind === KIND_WEEKLY && e.day >= from && e.day <= today)
    .map((e) => ({ day: e.day, change: (e.payload as WeeklyRecord).change }));
}
