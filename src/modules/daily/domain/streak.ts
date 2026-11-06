import { addDays, type LogEvent } from '../../../platform/events';
import { RATE_DAYS, REST_DAYS_PER_MONTH } from '../rules';
import { checksOn, isDone, KIND_ROUTINE, type RoutineItem, type RoutineRecord } from './routine';

// 血管収縮薬は連用で悪化しうるので、設定にかかわらず継続の対象にしない(HC-4)。
export function streakTargets(items: RoutineItem[]): RoutineItem[] {
  return items.filter((item) => item.streak && item.type !== 'decongestant');
}

// 1日の達成は有無だけで見る。規定より多く洗浄しても加点しない。
export function isDayComplete(items: RoutineItem[], events: LogEvent[], day: string): boolean {
  const targets = streakTargets(items);
  if (!targets.length) return false;
  const checks = checksOn(events, day);
  return targets.every((item) => isDone(item, checks, events, day));
}

// 月に数回の抜けは休みとして許し、1回で0に戻さない。今日はまだ途中なので抜けに数えない。
export function careStreak(items: RoutineItem[], events: LogEvent[], today: string, startedDay: string): number {
  let count = 0;
  const rests = new Map<string, number>();
  for (let day = today; day >= startedDay; day = addDays(day, -1)) {
    if (isDayComplete(items, events, day)) {
      count++;
    } else if (day !== today) {
      const month = day.slice(0, 7);
      const used = rests.get(month) ?? 0;
      if (used >= REST_DAYS_PER_MONTH) break;
      rests.set(month, used + 1);
    }
  }
  return count;
}

export function completionRate(items: RoutineItem[], events: LogEvent[], today: string, startedDay: string): number | null {
  const targets = streakTargets(items);
  let done = 0;
  let total = 0;
  for (let i = 0; i < RATE_DAYS; i++) {
    const day = addDays(today, -i);
    if (day < startedDay) break;
    if (day === today && !isDayComplete(items, events, day)) continue;
    const checks = checksOn(events, day);
    total += targets.length;
    done += targets.filter((item) => isDone(item, checks, events, day)).length;
  }
  return total ? done / total : null;
}

export function decongestantUsedOn(events: LogEvent[], day: string): boolean {
  return [...checksOn(events, day).values()].some((r: RoutineRecord) => r.itemType === 'decongestant' && r.done);
}

// 項目を外しても過去の使用を見失わないよう、記録に残した種類で数える。
export function decongestantRun(events: LogEvent[], today: string): number {
  if (!events.some((e) => e.kind === KIND_ROUTINE && (e.payload as RoutineRecord).itemType === 'decongestant')) return 0;
  let day = decongestantUsedOn(events, today) ? today : addDays(today, -1);
  let run = 0;
  while (decongestantUsedOn(events, day)) {
    run++;
    day = addDays(day, -1);
  }
  return run;
}
