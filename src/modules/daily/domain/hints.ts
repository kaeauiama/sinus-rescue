import { addDays, dayDiff, type LogEvent } from '../../../platform/events';
import {
  CONSULT_REPEAT_DAYS,
  CONSULT_WINDOW_DAYS,
  HINT_SNOOZE_DAYS,
  LATERALITY_PROMPT_MIN,
  PROLONGED_MIN_RECORDED,
  PROLONGED_MIN_SCORE,
  PROLONGED_WINDOW_DAYS,
  REBOUND_LOW_SCORE,
  REBOUND_RISE,
  REBOUND_WINDOW_DAYS,
  REVIEW_WEEKS,
} from '../rules';
import { graduationProgress } from './graduation';
import { checksOn } from './routine';
import { overallScore, symptomOn, type SymptomRecord } from './symptoms';

export const SETTING_HINTS_SEEN = 'daily.hintsSeen';

export type HintCode = 'BLOOD' | 'UNILATERAL' | 'ODOR' | 'REBOUND' | 'PROLONGED' | 'LONG_TERM';

function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -i));
}

function oneSided(record: SymptomRecord | null): 'left' | 'right' | null {
  if (!record) return null;
  const sides = Object.values(record.sides);
  if (sides.includes('left') && !sides.includes('right') && !sides.includes('both')) return 'left';
  if (sides.includes('right') && !sides.includes('left') && !sides.includes('both')) return 'right';
  return null;
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

// 受診の目安に当てはまる記録があるかを判定する。受診を指示せず、理由の表示にだけ使う(HC-3)。
export function consultHints(events: LogEvent[], today: string, startedDay: string): HintCode[] {
  const hints: HintCode[] = [];
  const recent = lastDays(today, CONSULT_WINDOW_DAYS);

  if (recent.some((day) => [...checksOn(events, day).values()].some((r) => r.rinseReturn === 'blood'))) hints.push('BLOOD');

  const sides = recent.map((day) => oneSided(symptomOn(events, day)));
  if (sides.filter((s) => s === 'left').length >= CONSULT_REPEAT_DAYS || sides.filter((s) => s === 'right').length >= CONSULT_REPEAT_DAYS) {
    hints.push('UNILATERAL');
  }

  const odorDays = recent.filter((day) => (symptomOn(events, day)?.scores.odor ?? 0) >= LATERALITY_PROMPT_MIN);
  if (odorDays.length >= CONSULT_REPEAT_DAYS) hints.push('ODOR');

  const history = lastDays(today, REBOUND_WINDOW_DAYS)
    .reverse()
    .map((day) => overallScore(symptomOn(events, day)))
    .filter((score): score is number => score != null);
  const latest = history.slice(-3);
  const lowest = Math.min(...history.slice(0, -3));
  if (latest.length === 3 && lowest <= REBOUND_LOW_SCORE && mean(latest) >= lowest + REBOUND_RISE) hints.push('REBOUND');

  const window = lastDays(today, PROLONGED_WINDOW_DAYS)
    .reverse()
    .map((day) => overallScore(symptomOn(events, day)))
    .filter((score): score is number => score != null);
  if (
    window.length >= PROLONGED_MIN_RECORDED &&
    mean(window.slice(-3)) >= PROLONGED_MIN_SCORE &&
    mean(window.slice(-3)) >= mean(window.slice(0, 3))
  ) {
    hints.push('PROLONGED');
  }

  if (dayDiff(startedDay, today) >= REVIEW_WEEKS * 7 && !graduationProgress(events, today, startedDay).reached) hints.push('LONG_TERM');

  return hints;
}

// 一度確認した案内は、しばらく繰り返さない。
export function unseenHints(hints: HintCode[], seen: unknown, today: string): HintCode[] {
  const days = (seen as Partial<Record<HintCode, string>> | undefined) ?? {};
  return hints.filter((code) => {
    const day = days[code];
    return !day || dayDiff(day, today) >= HINT_SNOOZE_DAYS;
  });
}
