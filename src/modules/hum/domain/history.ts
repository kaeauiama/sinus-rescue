import { addDays, type LogEvent, logicalDay } from '../../../platform/events';
import { MORNING_END_HOUR, SESSION_COUNTED_SEC } from '../rules';
import { KIND_SESSION, type SessionRecord } from './session';

export const KIND_MORNING = 'hum_morning';
export const SETTING_MORNING_SKIPPED = 'hum.morningSkippedDay';

export interface MorningRecord {
  score: number;
}

// 翌朝の1問は、使い始めた翌日以降の午前中に1日1回だけ聞く。
export function morningDue(events: LogEvent[], skippedDay: unknown, now: Date): boolean {
  if (!events.length) return false;
  const today = logicalDay(now);
  if (skippedDay === today || now.getHours() >= MORNING_END_HOUR) return false;
  if (events[0].day === today) return false;
  return !events.some((e) => e.kind === KIND_MORNING && e.day === today);
}

export function countedSessionOn(events: LogEvent[], day: string): boolean {
  return events.some((e) => {
    if (e.kind !== KIND_SESSION || e.day !== day) return false;
    const record = e.payload as SessionRecord;
    return record.completed || record.durationSec >= SESSION_COUNTED_SEC;
  });
}

export interface DayRow {
  day: string;
  minutes: number;
  sessions: number;
  morning: number | null;
}

export function dayRows(events: LogEvent[], today: string, count: number): DayRow[] {
  const rows: DayRow[] = [];
  for (let i = 0; i < count; i++) {
    const day = addDays(today, -i);
    const sessions = events.filter((e) => e.kind === KIND_SESSION && e.day === day);
    const morning = events.findLast((e) => e.kind === KIND_MORNING && e.day === day);
    rows.push({
      day,
      sessions: sessions.length,
      minutes: Math.round(
        sessions.reduce((sum, e) => sum + (e.payload as SessionRecord).durationSec, 0) / 60,
      ),
      morning: morning ? (morning.payload as MorningRecord).score : null,
    });
  }
  return rows;
}
