import { createEvent } from '../../../platform/events';
import { dayLabel, daysBetween } from '../../../platform/events';
import { dayRows, KIND_MORNING, morningDue } from './history';
import { KIND_SESSION } from './session';

const at = (text: string) => new Date(text);
const yesterday = at('2026-11-03T20:00:00');
const morning = at('2026-11-04T08:00:00');

describe('morningDue', () => {
  const past = [createEvent('hum_profile', {}, yesterday)];

  it('使い始めた翌日以降の午前中に聞く', () => {
    expect(morningDue(past, undefined, morning)).toBe(true);
  });

  it('記録がなければ聞かない', () => {
    expect(morningDue([], undefined, morning)).toBe(false);
  });

  it('使い始めた当日は聞かない', () => {
    const first = [createEvent('hum_profile', {}, at('2026-11-04T07:00:00'))];
    expect(morningDue(first, undefined, morning)).toBe(false);
  });

  it('答えた日と、答えないと選んだ日は聞かない', () => {
    expect(morningDue([...past, createEvent(KIND_MORNING, { score: 5 }, morning)], undefined, morning)).toBe(false);
    expect(morningDue(past, '2026-11-04', morning)).toBe(false);
  });

  it('午後は聞かない', () => {
    expect(morningDue(past, undefined, at('2026-11-04T15:00:00'))).toBe(false);
  });

  it('午前4時より前は前日として扱う', () => {
    const earlier = [createEvent('hum_profile', {}, at('2026-11-02T20:00:00'))];
    const answered = createEvent(KIND_MORNING, { score: 5 }, yesterday);
    expect(morningDue([...earlier, answered], undefined, at('2026-11-04T03:00:00'))).toBe(false);
  });
});

describe('dayRows', () => {
  const session = (durationSec: number, date: Date) => createEvent(KIND_SESSION, { durationSec }, date);

  it('日ごとの時間と今朝の値をまとめ、新しい順に返す', () => {
    const events = [
      session(120, at('2026-11-04T09:00:00')),
      session(180, at('2026-11-04T21:00:00')),
      createEvent(KIND_MORNING, { score: 7 }, morning),
    ];
    const rows = dayRows(events, '2026-11-04', 3);
    expect(rows.map((r) => r.day)).toEqual(['2026-11-04', '2026-11-03', '2026-11-02']);
    expect(rows[0]).toMatchObject({ sessions: 2, minutes: 5, morning: 7 });
    expect(rows[1]).toMatchObject({ sessions: 0, minutes: 0, morning: null });
  });

  it('ハミングしなかった日も今朝の値を残す', () => {
    const rows = dayRows([createEvent(KIND_MORNING, { score: 4 }, morning)], '2026-11-04', 1);
    expect(rows[0]).toMatchObject({ sessions: 0, morning: 4 });
  });
});

it('日付の表示と経過日数を返す', () => {
  expect(dayLabel('2026-11-04')).toBe('11/4 水');
  expect(daysBetween('2026-11-01T00:00:00+09:00', at('2026-11-08T12:00:00+09:00'))).toBe(7);
});
