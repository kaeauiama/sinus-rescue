import { GLIDE_HOLD_RATIO, GLIDE_TOLERANCE_CENTS, LANE_STAMP_MAX, PITCH_TOLERANCE_CENTS } from '../rules';
import type { CapturePoint } from './dsp';
import { bandCents, bandHz, foldOctave, gradeOf, judgeHum, laneSegments, previousGrade, setStamps, type Grade } from './lane';
import { builtInPrograms, expandProgram, pitchContext, type Program } from './programs';
import { DEFAULT_SESSION, type PlanTone } from './session';

const STEADY: PlanTone = { toneId: null, label: '楽な高さ', hz: 200 };
const GLIDE: PlanTone = { toneId: null, label: '上へ滑らせる', hz: 200, toHz: 300 };
const MS = 5000;
const CTX = pitchContext([{ toneId: 'a', label: 'A', hz: 131 }], { comfortHz: 139, lowHz: 98, falsettoHz: null });
const program = (id: string) => builtInPrograms({ ...DEFAULT_SESSION, humsPerSet: 5 }).find((p) => p.id === id) as Program;
const at = (hz: number, cents: number) => hz * 2 ** (cents / 1200);

// 50ミリ秒ごとの声。f は時刻から声の高さ(出していなければ null)を返す。
const track = (f: (t: number) => number | null): CapturePoint[] =>
  Array.from({ length: MS / 50 + 1 }, (_, i) => ({ t: i * 50, f0: f(i * 50), rms: 0.01 }));

describe('帯の形', () => {
  it('高さが動く回は帯を広くする', () => {
    expect(bandCents(STEADY)).toBe(PITCH_TOLERANCE_CENTS);
    expect(bandCents(GLIDE)).toBe(GLIDE_TOLERANCE_CENTS);
  });

  it('滑らせる回は始めと終わりで止まり、その間を半音の刻みで等速に動く', () => {
    const hold = MS * GLIDE_HOLD_RATIO;
    expect(bandHz(GLIDE, 0, MS)).toBe(200);
    expect(bandHz(GLIDE, hold, MS)).toBe(200);
    expect(bandHz(GLIDE, MS / 2, MS)).toBeCloseTo(Math.sqrt(200 * 300), 6);
    expect(bandHz(GLIDE, MS - hold, MS)).toBeCloseTo(300, 6);
    expect(bandHz(GLIDE, MS, MS)).toBeCloseTo(300, 6);
    expect(bandHz(STEADY, MS / 2, MS)).toBe(200);
  });
});

describe('判定', () => {
  it('1オクターブのずれだけを帯の高さに重ねる', () => {
    expect(foldOctave(1190)).toBe(-10);
    expect(foldOctave(-1210)).toBe(-10);
    expect(foldOctave(700)).toBe(700);
    expect(foldOctave(30)).toBe(30);
  });

  it('帯の中にいた割合を数え、太さは帯の種類で変わる', () => {
    expect(judgeHum(track(() => at(200, 40)), STEADY, MS, 400)).toBe(1);
    expect(judgeHum(track(() => at(200, 60)), STEADY, MS, 400)).toBe(0);
    expect(judgeHum(track((t) => at(bandHz(GLIDE, t, MS), 60)), GLIDE, MS, 400)).toBe(1);
  });

  it('出だしは数えず、声が出ていない時間は外として数える', () => {
    expect(judgeHum(track((t) => (t < 400 ? 330 : 200)), STEADY, MS, 400)).toBe(1);
    const halfSilent = judgeHum(track((t) => (t < 2700 ? null : 200)), STEADY, MS, 400);
    expect(halfSilent).toBeCloseTo(0.5, 1);
    expect(judgeHum([], STEADY, MS, 400)).toBe(0);
  });

  it('1オクターブ下の声も帯の中に数える', () => {
    expect(judgeHum(track(() => 100), STEADY, MS, 400)).toBe(1);
  });

  it('割合を4段階に分ける', () => {
    expect([0.8, 0.79, 0.5, 0.49, 0.2, 0.19, 0].map(gradeOf)).toEqual(['GREAT', 'GOOD', 'GOOD', 'BAD', 'BAD', 'POOR', 'POOR']);
  });
});

describe('帯の並び', () => {
  it('今の拍を0として前後に並べ、休憩で区切る', () => {
    const plan = expandProgram(program('hill'), CTX);
    const segments = laneSegments(plan, 2, (b) => b.ms);
    expect(segments).toHaveLength(18);
    expect(segments[2].start).toBe(0);
    expect(segments[0].start).toBe(-(plan.beats[0].ms + plan.beats[1].ms));
    expect(segments.map((s) => s.tone != null)).toEqual(plan.beats.slice(0, 18).map((b) => b.kind === 'hum'));
    segments.slice(1).forEach((s, i) => expect(s.start).toBe(segments[i].end));
    expect(plan.beats[18].kind).toBe('rest');
    expect(laneSegments(plan, 18, (b) => b.ms)).toEqual([]);
  });
});

describe('結果の丸', () => {
  it('つまんだあとに流す回は数えず、今の回と、まだの回を分ける', () => {
    const plan = expandProgram(program('interval'), CTX);
    const judgedHums = plan.beats.flatMap((b, i) => (b.kind === 'hum' && !b.flush ? [i] : []));
    const grades = new Map<number, Grade>([
      [judgedHums[0], 'GREAT'],
      [judgedHums[1], 'BAD'],
    ]);
    const breathOfThird = judgedHums[2] - 1;
    expect(setStamps(plan, breathOfThird, grades)).toEqual(['GREAT', 'BAD', 'current', 'pending']);
    expect(previousGrade(plan, judgedHums[0] + 1, grades)).toBe('GREAT');
    expect(previousGrade(plan, judgedHums[0] + 3, grades)).toBeNull();
  });

  it('休憩なしで続くセットでは、今のセットの分だけを並べる', () => {
    const custom: Program = {
      id: 'x',
      name: 'x',
      description: '',
      pace: 'standard',
      shuffle: false,
      custom: true,
      blocks: [{ nose: 'open', pitch: { kind: 'step', semitones: 0 }, hums: 3, sets: 2, restSec: 0 }],
    };
    const plan = expandProgram(custom, CTX);
    // 拍は 吸う・んー の繰り返しなので、9 は2セット目の2回目の「んー」。それより前の回はすべて判定済み。
    const grades = new Map<number, Grade>(plan.beats.flatMap((b, i) => (b.kind === 'hum' && i < 9 ? [[i, 'GOOD'] as [number, Grade]] : [])));
    expect(setStamps(plan, 9, grades)).toEqual(['GOOD', 'current', 'pending']);
  });

  it('連続型のように回数が多いときは並べない', () => {
    const plan = expandProgram(program('continuous'), CTX);
    expect(plan.beats[0].kind === 'breath' && plan.beats[0].reps).toBeGreaterThan(LANE_STAMP_MAX);
    expect(setStamps(plan, 0, new Map())).toEqual([]);
  });
});
