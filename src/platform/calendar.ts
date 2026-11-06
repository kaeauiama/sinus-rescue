import { addDays, weekdayOf } from './events';

export const monthOf = (day: string) => day.slice(0, 7);

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y}年${m}月`;
}

// 日曜始まりの週ごとに並べる。月の外は null で埋める。
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const length = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(weekdayOf(first)).fill(null),
    ...Array.from({ length }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}
