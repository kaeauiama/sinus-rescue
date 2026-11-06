export type EventOrigin = 'live' | 'import' | 'backfill' | 'same_as_yesterday';

export interface LogEvent<P = unknown> {
  id: string;
  ts: string;
  day: string;
  kind: string;
  payload: P;
  source: EventOrigin;
  v: number;
}

export const DAY_BOUNDARY_HOUR = 4;
export const EVENT_VERSION = 1;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

// 夜更かししても日付がずれないよう、午前4時を1日の区切りにする。
export function logicalDay(date: Date): string {
  const d = new Date(date);
  if (d.getHours() < DAY_BOUNDARY_HOUR) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localIso(date: Date): string {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export interface EventOptions {
  day?: string;
  source?: EventOrigin;
}

// 過去の日を指定すると、遡って入力した記録として印を付ける。
export function createEvent<P>(kind: string, payload: P, now: Date = new Date(), options: EventOptions = {}): LogEvent<P> {
  const today = logicalDay(now);
  const day = options.day ?? today;
  return {
    id: crypto.randomUUID(),
    ts: localIso(now),
    day,
    kind,
    payload,
    source: options.source ?? (day === today ? 'live' : 'backfill'),
    v: EVENT_VERSION,
  };
}

// 追記型のログなので、同じ日に複数あれば最後の記録を今の値として扱う。
export function latestOn<P>(events: LogEvent[], kind: string, day: string): P | null {
  const event = events.findLast((e) => e.kind === kind && e.day === day);
  return event ? (event.payload as P) : null;
}

export function daysBetween(fromIso: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(fromIso).getTime()) / 86_400_000);
}

// 論理日どうしの差。夏時間があっても暦の日数を返す。
export function dayDiff(from: string, to: string): number {
  const utc = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const weekdayOf = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

export function dayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}/${d} ${WEEKDAYS[weekdayOf(day)]}`;
}

// 見出し用の長い表記。例: 11月6日(金)
export function longDayLabel(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${m}月${d}日(${WEEKDAYS[weekdayOf(day)]})`;
}
