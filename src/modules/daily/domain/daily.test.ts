import { addDays, createEvent, type LogEvent } from '../../../platform/events';
import { KIND_MORNING } from '../../hum/domain/history';
import { KIND_SESSION } from '../../hum/domain/session';
import { decongestantText } from '../copy';
import { REST_DAYS_PER_MONTH } from '../rules';
import { graduationProgress } from './graduation';
import { consultHints, unseenHints } from './hints';
import { buildIcs, DEFAULT_REMINDERS } from './ics';
import { KIND_MED, medList, routineItemForMed, type MedRecord } from './meds';
import { currentProtocol, KIND_PROTOCOL, needsWaterCaution } from './rinse';
import {
  checksOn,
  DEFAULT_ROUTINE,
  firstRecordedDay,
  humSessionOn,
  isDone,
  KIND_ROUTINE,
  type RoutineItem,
  type RoutineRecord,
} from './routine';
import { careStreak, completionRate, decongestantRun, isDayComplete, streakTargets } from './streak';
import { summaryText, visitSummary } from './summary';
import { KIND_SYMPTOM, overallScore, type SymptomRecord } from './symptoms';
import { timelineDays } from './timeline';
import { KIND_WEEKLY, weeklyDue, type WeeklyRecord } from './weekly';

const TODAY = '2026-11-20';
const noon = (day: string) => new Date(`${day}T12:00:00`);
const event = <P,>(kind: string, payload: P, day: string): LogEvent<P> => createEvent(kind, payload, noon(day));

const check = (itemId: string, day: string, itemType: RoutineRecord['itemType'] = 'rinse', done = true, rinseReturn?: RoutineRecord['rinseReturn']) =>
  event<RoutineRecord>(KIND_ROUTINE, { itemId, itemType, done, rinseReturn }, day);

const completeDay = (day: string) => [check('rinse-morning', day), check('rinse-night', day)];

const symptoms = (day: string, value: number, sides: SymptomRecord['sides'] = {}, extra: SymptomRecord['scores'] = {}) =>
  event<SymptomRecord>(
    KIND_SYMPTOM,
    { scores: { congestion: value, drip: value, smellLoss: value, heaviness: value, odor: value, stress: 9, ...extra }, sides },
    day,
  );

describe('ルーチン', () => {
  it('同じ項目は最後のチェックを今の状態にする', () => {
    const events = [check('rinse-morning', TODAY), check('rinse-morning', TODAY, 'rinse', false)];
    expect(checksOn(events, TODAY).get('rinse-morning')?.done).toBe(false);
  });

  it('ハミングは、セッションの記録があれば自動で済みになる', () => {
    const hum = DEFAULT_ROUTINE.find((item) => item.type === 'hum') as RoutineItem;
    const session = event(KIND_SESSION, { completed: true, durationSec: 300 }, TODAY);
    expect(isDone(hum, new Map(), [session], TODAY)).toBe(true);
    expect(isDone(hum, new Map(), [], TODAY)).toBe(false);
  });

  it('途中でやめた短いセッションは実施に数えない', () => {
    expect(humSessionOn([event(KIND_SESSION, { completed: false, durationSec: 20 }, TODAY)], TODAY)).toBe(false);
    expect(humSessionOn([event(KIND_SESSION, { completed: false, durationSec: 90 }, TODAY)], TODAY)).toBe(true);
  });

  it('開始日は、遡って入力した最も古い日まで広げる', () => {
    const backfilled = createEvent(KIND_SYMPTOM, {}, noon(TODAY), { day: '2026-11-10' });
    const later = createEvent(KIND_SYMPTOM, {}, noon('2026-11-15'));
    expect(firstRecordedDay([later, backfilled], '2026-11-15', TODAY)).toBe('2026-11-10');
    expect(firstRecordedDay([], undefined, TODAY)).toBe(TODAY);
  });
});

describe('継続', () => {
  const started = addDays(TODAY, -30);

  it('対象の項目がすべて済んだ日を数える', () => {
    const events = [addDays(TODAY, -2), addDays(TODAY, -1), TODAY].flatMap(completeDay);
    expect(careStreak(DEFAULT_ROUTINE, events, TODAY, addDays(TODAY, -2))).toBe(3);
  });

  it('今日はまだ途中なので、未完了でも連続を切らない', () => {
    const events = completeDay(addDays(TODAY, -1));
    expect(careStreak(DEFAULT_ROUTINE, events, TODAY, addDays(TODAY, -1))).toBe(1);
  });

  it('月に2回までの抜けは休みとして許す', () => {
    const events = [-1, -3, -5].flatMap((d) => completeDay(addDays(TODAY, d)));
    expect(careStreak(DEFAULT_ROUTINE, events, TODAY, addDays(TODAY, -5))).toBe(3);
  });

  it(`月に${REST_DAYS_PER_MONTH + 1}回抜けると連続が切れる`, () => {
    const events = [-1, -5].flatMap((d) => completeDay(addDays(TODAY, d)));
    expect(careStreak(DEFAULT_ROUTINE, events, TODAY, started)).toBe(1);
  });

  it('規定より多く洗浄しても加点しない', () => {
    const events = [...completeDay(TODAY), ...completeDay(TODAY), ...completeDay(TODAY)];
    expect(careStreak(DEFAULT_ROUTINE, events, TODAY, TODAY)).toBe(1);
    expect(completionRate(DEFAULT_ROUTINE, events, TODAY, TODAY)).toBe(1);
  });

  it('実施率は、未完了の今日を分母に入れない', () => {
    const events = [check('rinse-morning', addDays(TODAY, -1))];
    expect(completionRate(DEFAULT_ROUTINE, events, TODAY, addDays(TODAY, -1))).toBe(0.5);
    expect(completionRate([], events, TODAY, TODAY)).toBeNull();
  });
});

describe('血管収縮薬(HC-4)', () => {
  const decongestant: RoutineItem = { id: 'med-a', label: '点鼻', slot: 'morning', type: 'decongestant', streak: true };

  it('設定で継続に入れようとしても対象にしない', () => {
    expect(streakTargets([decongestant])).toEqual([]);
    const events = [check(decongestant.id, TODAY, 'decongestant')];
    expect(isDayComplete([decongestant], events, TODAY)).toBe(false);
    expect(careStreak([decongestant], events, TODAY, TODAY)).toBe(0);
  });

  it('連続使用の日数を数える', () => {
    const events = [-2, -1, 0].map((d) => check(decongestant.id, addDays(TODAY, d), 'decongestant'));
    expect(decongestantRun(events, TODAY)).toBe(3);
    expect(decongestantRun(events.slice(0, 2), TODAY)).toBe(2);
    expect(decongestantRun([], TODAY)).toBe(0);
  });

  it('使わなかった日で連続が切れる', () => {
    const events = [-3, -1, 0].map((d) => check(decongestant.id, addDays(TODAY, d), 'decongestant'));
    expect(decongestantRun(events, TODAY)).toBe(2);
  });

  it('項目を外したあとも過去の使用を数える', () => {
    const events = [check('removed', TODAY, 'decongestant')];
    expect(decongestantRun(events, TODAY)).toBe(1);
  });

  it('3日目に注意し、5日目から確認を案内する。やめるようには言わない', () => {
    expect(decongestantText(0)).toBeNull();
    expect(decongestantText(2)).toBe('連続2日目');
    expect(decongestantText(3)).toContain('強くなることがあります');
    expect(decongestantText(5)).toContain('医師か薬剤師に確認');
    for (const run of [1, 3, 5, 9]) expect(decongestantText(run)).not.toMatch(/やめて|中止して/);
  });

  it('点鼻薬の項目は種類に応じて作り、血管収縮薬は継続に入れない', () => {
    expect(routineItemForMed({ medId: 'a', medType: 'steroid', label: 'S' })?.streak).toBe(true);
    expect(routineItemForMed({ medId: 'a', medType: 'decongestant', label: 'D' })?.streak).toBe(false);
    expect(routineItemForMed({ medId: 'a', medType: 'antibiotic', label: 'A' })).toBeNull();
  });
});

describe('総合スコア', () => {
  it('5項目の平均で、ストレスは含めない', () => {
    expect(overallScore({ scores: { congestion: 2, drip: 4, smellLoss: 0, heaviness: 2, odor: 2, stress: 10 }, sides: {} })).toBe(2);
  });

  it('未入力は0と見なさず、答えた項目で平均する', () => {
    expect(overallScore({ scores: { congestion: 4, drip: 6, smellLoss: 8 }, sides: {} })).toBe(6);
  });

  it('答えが少なすぎる日はスコアを出さない', () => {
    expect(overallScore({ scores: { congestion: 4, drip: 6 }, sides: {} })).toBeNull();
    expect(overallScore(null)).toBeNull();
  });
});

describe('卒業カウンター', () => {
  const started = addDays(TODAY, -40);
  const lightDays = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, i) => symptoms(addDays(TODAY, -i - offset), 1));

  it('軽い日の連続を数える', () => {
    expect(graduationProgress(lightDays(5), TODAY, started)).toMatchObject({ days: 5, reached: false });
    expect(graduationProgress(lightDays(14), TODAY, started)).toMatchObject({ days: 14, reached: true });
  });

  it('スコアが上がると数え直す', () => {
    expect(graduationProgress([symptoms(addDays(TODAY, -2), 5), ...lightDays(2)], TODAY, started).days).toBe(2);
  });

  it('今日の未入力は連続を切らない', () => {
    expect(graduationProgress(lightDays(3, 1), TODAY, started).days).toBe(3);
  });

  it('短い抜けは数えないが切らず、長い抜けで切れる', () => {
    expect(graduationProgress([...lightDays(1, 3), ...lightDays(1)], TODAY, started).days).toBe(2);
    expect(graduationProgress([...lightDays(1, 4), ...lightDays(1)], TODAY, started).days).toBe(1);
  });

  it('血管収縮薬を使った日で数え直す', () => {
    const events = [...lightDays(5), check('d', addDays(TODAY, -2), 'decongestant')];
    expect(graduationProgress(events, TODAY, started).days).toBe(2);
  });

  it('週の評価が悪化なら数え直す', () => {
    const weekly = event<WeeklyRecord>(KIND_WEEKLY, { change: -1, scent: null, smell: null, cleaned: null }, addDays(TODAY, -1));
    expect(graduationProgress([...lightDays(5), weekly], TODAY, started).days).toBe(1);
  });
});

describe('相談の目安', () => {
  const started = addDays(TODAY, -30);

  it('何もなければ案内しない', () => {
    expect(consultHints([symptoms(TODAY, 2)], TODAY, started)).toEqual([]);
  });

  it('洗浄液に血が混じった日があれば案内する', () => {
    expect(consultHints([check('r', TODAY, 'rinse', true, 'blood')], TODAY, started)).toContain('BLOOD');
  });

  it('片側だけの記録が続くと案内する', () => {
    const left = [0, -1, -2].map((d) => symptoms(addDays(TODAY, d), 5, { congestion: 'left' }));
    expect(consultHints(left, TODAY, started)).toContain('UNILATERAL');
    expect(consultHints(left.slice(0, 2), TODAY, started)).not.toContain('UNILATERAL');
  });

  it('両側の記録は片側に数えない', () => {
    const both = [0, -1, -2].map((d) => symptoms(addDays(TODAY, d), 5, { congestion: 'both' }));
    const mixed = [0, -1, -2].map((d) => symptoms(addDays(TODAY, d), 5, { congestion: 'left', odor: 'right' }));
    expect(consultHints(both, TODAY, started)).not.toContain('UNILATERAL');
    expect(consultHints(mixed, TODAY, started)).not.toContain('UNILATERAL');
  });

  it('嫌なにおいが続くと案内する', () => {
    const events = [0, -1, -2].map((d) => symptoms(addDays(TODAY, d), 1, {}, { odor: 5 }));
    expect(consultHints(events, TODAY, started)).toContain('ODOR');
  });

  it('いったん軽くなったあと強くなると案内する', () => {
    const events = [symptoms(addDays(TODAY, -10), 1), ...[0, -1, -2].map((d) => symptoms(addDays(TODAY, d), 5))];
    expect(consultHints(events, TODAY, started)).toContain('REBOUND');
  });

  it('軽くならない状態が続くと案内する', () => {
    const events = Array.from({ length: 10 }, (_, i) => symptoms(addDays(TODAY, -i), 5));
    expect(consultHints(events, TODAY, started)).toContain('PROLONGED');
  });

  it('軽くなってきているなら、続いていても案内しない', () => {
    const events = Array.from({ length: 10 }, (_, i) => symptoms(addDays(TODAY, -i), 4 + Math.min(i, 5)));
    expect(consultHints(events, TODAY, started)).not.toContain('PROLONGED');
  });

  it('12週たって卒業の目安に届いていなければ案内する', () => {
    expect(consultHints([], TODAY, addDays(TODAY, -84))).toContain('LONG_TERM');
    expect(consultHints([], TODAY, addDays(TODAY, -83))).not.toContain('LONG_TERM');
  });

  it('確認した案内は、しばらく繰り返さない', () => {
    expect(unseenHints(['BLOOD', 'ODOR'], { BLOOD: addDays(TODAY, -3) }, TODAY)).toEqual(['ODOR']);
    expect(unseenHints(['BLOOD'], { BLOOD: addDays(TODAY, -14) }, TODAY)).toEqual(['BLOOD']);
    expect(unseenHints(['BLOOD'], undefined, TODAY)).toEqual(['BLOOD']);
  });
});

describe('週の振り返り', () => {
  it('使い始めてから1週間たつと案内する', () => {
    expect(weeklyDue([], TODAY, addDays(TODAY, -6))).toBe(false);
    expect(weeklyDue([], TODAY, addDays(TODAY, -7))).toBe(true);
  });

  it('前回の記録から数える', () => {
    const weekly = event(KIND_WEEKLY, { change: 0 }, addDays(TODAY, -2));
    expect(weeklyDue([weekly], TODAY, addDays(TODAY, -30))).toBe(false);
  });
});

describe('薬', () => {
  it('開始と終了を1件にまとめる', () => {
    const record = (action: MedRecord['action'], date: string): MedRecord => ({ medId: 'a', medType: 'steroid', label: 'S', action, date });
    const events = [event(KIND_MED, record('start', '2026-11-01'), '2026-11-01'), event(KIND_MED, record('stop', '2026-11-10'), '2026-11-10')];
    expect(medList(events)).toEqual([{ medId: 'a', medType: 'steroid', label: 'S', start: '2026-11-01', end: '2026-11-10' }]);
  });
});

describe('洗浄の手順', () => {
  it('最後の記録を今の手順にする', () => {
    const protocol = (water: 'tap' | 'boiled') => ({ water, solution: null, temp: null, volumeMl: null });
    expect(currentProtocol([event(KIND_PROTOCOL, protocol('tap'), '2026-11-01'), event(KIND_PROTOCOL, protocol('boiled'), '2026-11-02')]).water).toBe('boiled');
    expect(currentProtocol([]).water).toBeNull();
  });

  it('水道水と浄水器の水には注意を出す', () => {
    expect(needsWaterCaution('tap')).toBe(true);
    expect(needsWaterCaution('filtered')).toBe(true);
    expect(needsWaterCaution('boiled')).toBe(false);
    expect(needsWaterCaution(null)).toBe(false);
  });
});

describe('カレンダーの書き出し', () => {
  const now = new Date('2026-11-04T10:00:00');

  it('有効な項目だけを毎週の繰り返しで出力する', () => {
    const ics = buildIcs(DEFAULT_REMINDERS, now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA');
    expect(ics).toContain('DTSTART:20261104T073000');
    expect(ics).toContain('TRIGGER:PT0M');
  });

  it('曜日を絞ると、次のその曜日から始める', () => {
    const ics = buildIcs([{ id: 'hum', enabled: true, time: '21:00', days: [6] }], now);
    expect(ics).toContain('DTSTART:20261107T210000');
    expect(ics).toContain('BYDAY=SA');
  });

  it('曜日が1つもなければ出力しない', () => {
    expect(buildIcs([{ id: 'hum', enabled: true, time: '21:00', days: [] }], now)).not.toContain('VEVENT');
  });
});

describe('経過と受診サマリ', () => {
  const started = addDays(TODAY, -13);
  const events = [
    symptoms(addDays(TODAY, -8), 6, { congestion: 'left' }),
    symptoms(TODAY, 2, { congestion: 'left' }),
    ...completeDay(TODAY),
    event(KIND_MORNING, { score: 7 }, TODAY),
  ];

  it('記録のない日は null のまま残す', () => {
    const days = timelineDays(events, DEFAULT_ROUTINE, TODAY, 3);
    expect(days.map((d) => d.day)).toEqual([addDays(TODAY, -2), addDays(TODAY, -1), TODAY]);
    expect(days[0].overall).toBeNull();
    expect(days[2]).toMatchObject({ overall: 2, careComplete: true, morning: 7 });
  });

  it('同じ日に直した記録は1日として数える', () => {
    const edited = [...events, symptoms(TODAY, 2, { congestion: 'left' })];
    const sections = visitSummary(edited, DEFAULT_ROUTINE, TODAY, started);
    expect(sections.find((s) => s.title === '左右')?.lines).toEqual(['鼻づまり: 左 2日']);
  });

  it('週平均の見出しは開始日より前にしない', () => {
    const lines = visitSummary(events, DEFAULT_ROUTINE, TODAY, addDays(TODAY, -2)).find((s) => s.title.startsWith('総合スコア'))?.lines;
    expect(lines).toEqual(['11/18 水〜 2']);
  });

  it('薬の名前と種類が同じなら重ねて書かない', () => {
    const med = event(KIND_MED, { medId: 'a', medType: 'steroid', label: 'ステロイド点鼻', action: 'start', date: TODAY }, TODAY);
    expect(visitSummary([med], DEFAULT_ROUTINE, TODAY, TODAY).find((s) => s.title === '薬')?.lines[0]).toMatch(/^ステロイド点鼻 11\/20/);
  });

  it('要約に原因や効果の判断を含めない(HC-1, HC-7)', () => {
    const text = summaryText('サマリ', visitSummary(events, DEFAULT_ROUTINE, TODAY, started));
    expect(text).toContain('本人による記録の集計です');
    expect(text).not.toMatch(/原因|効果|改善|診断/);
  });
});
