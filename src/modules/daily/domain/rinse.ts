import type { LogEvent } from '../../../platform/events';

export const KIND_PROTOCOL = 'protocol';

export type RinseWater = 'boiled' | 'distilled' | 'sterile' | 'filtered' | 'tap';

export const RINSE_WATERS: { id: RinseWater; label: string; caution: boolean }[] = [
  { id: 'boiled', label: '煮沸して冷ました水', caution: false },
  { id: 'distilled', label: '蒸留水', caution: false },
  { id: 'sterile', label: '滅菌水', caution: false },
  { id: 'filtered', label: '浄水器の水', caution: true },
  { id: 'tap', label: '水道水', caution: true },
];

export const RINSE_SOLUTIONS = ['市販の粉末', '自分で調合', 'その他'];
export const RINSE_TEMPS = ['ぬるま湯', '常温'];
export const RINSE_VOLUMES = [100, 150, 200, 240, 300];

export interface RinseProtocol {
  water: RinseWater | null;
  solution: string | null;
  temp: string | null;
  volumeMl: number | null;
}

export const EMPTY_PROTOCOL: RinseProtocol = { water: null, solution: null, temp: null, volumeMl: null };

// 手順の変更も分析の材料になるので、設定ではなく記録として残す。
export function currentProtocol(events: LogEvent[]): RinseProtocol {
  const event = events.findLast((e) => e.kind === KIND_PROTOCOL);
  return event ? (event.payload as RinseProtocol) : EMPTY_PROTOCOL;
}

export const needsWaterCaution = (water: RinseWater | null) =>
  RINSE_WATERS.some((w) => w.id === water && w.caution);
