import {
  DEMO_LEAD_SEC,
  GLIDE_HOLD_RATIO,
  GLIDE_TOLERANCE_CENTS,
  HUM_HOLD_SEC,
  LANE_STAMP_MAX,
  PITCH_TOLERANCE_CENTS,
  STEADY_TOLERANCE_CENTS,
} from '../rules';
import type { CapturePoint } from './dsp';
import {
  bandCents,
  bandHz,
  demoPath,
  foldOctave,
  gradeOf,
  judgeHum,
  laneSegments,
  previousGrade,
  setStamps,
  type Grade,
} from './lane';
import { builtInPrograms, expandProgram, pitchContext, type Block, type Program } from './programs';
import { DEFAULT_SESSION, resumeCursor, type PlanTone } from './session';

const STEADY: PlanTone = { toneId: null, label: '楽な高さ', hz: 200 };
const GLIDE: PlanTone = { toneId: null, label: '上へ滑らせる', hz: 200, toHz: 300 };
const MS = 5000;
const CTX = pitchContext([{ toneId: 'a', label: 'A', hz: 131 }], { comfortHz: 139, lowHz: 98, falsettoHz: null });
const program = (id: string) => builtInPrograms({ ...DEFAULT_SESSION, humsPerSet: 5 }).find((p) => p.id === id) as Program;
const at = (hz: number, cents: number) => hz * 2 ** (cents / 1200);
const customOf = (blocks: Block[]): Program => ({ id: 'x', name: 'x', description: '', pace: 'standard', shuffle: false, custom: true, blocks });
const glideBlock = (direction: 'up' | 'down' | 'alternate', sets = 1, restSec = 0): Block => ({
  nose: 'open',
  pitch: { kind: 'glide', direction },
  hums: 4,
  sets,
  restSec,
});

// 50ミリ秒ごとの声。f は時刻から声の高さ(出していなければ null)を返す。
const track = (f: (t: number) => number | null): CapturePoint[] =>
  Array.from({ length: MS / 50 + 1 }, (_, i) => ({ t: i * 50, f0: f(i * 50), rms: 0.01 }));

describe('帯の形', () => {
  it('高さが動く回は帯を広くし、一定の回も登録の音合わせより少し広くする(D-039)', () => {
    expect(bandCents(STEADY)).toBe(STEADY_TOLERANCE_CENTS);
    expect(bandCents(GLIDE)).toBe(GLIDE_TOLERANCE_CENTS);
    expect(STEADY_TOLERANCE_CENTS).toBeGreaterThan(PITCH_TOLERANCE_CENTS);
    expect(GLIDE_TOLERANCE_CENTS).toBeGreaterThan(STEADY_TOLERANCE_CENTS);
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
    expect(judgeHum(track(() => at(200, STEADY_TOLERANCE_CENTS - 10)), STEADY, MS, 400)).toBe(1);
    expect(judgeHum(track(() => at(200, STEADY_TOLERANCE_CENTS + 10)), STEADY, MS, 400)).toBe(0);
    expect(judgeHum(track((t) => at(bandHz(GLIDE, t, MS), GLIDE_TOLERANCE_CENTS - 10)), GLIDE, MS, 400)).toBe(1);
    expect(judgeHum(track((t) => at(bandHz(GLIDE, t, MS), GLIDE_TOLERANCE_CENTS + 10)), GLIDE, MS, 400)).toBe(0);
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
    const segments = laneSegments(plan, 2);
    expect(segments).toHaveLength(18);
    expect(segments[2].start).toBe(0);
    expect(segments[0].start).toBe(-(plan.beats[0].ms + plan.beats[1].ms));
    expect(segments.map((s) => s.tone != null)).toEqual(plan.beats.slice(0, 18).map((b) => b.kind === 'hum'));
    segments.slice(1).forEach((s, i) => expect(s.start).toBe(segments[i].end));
    expect(plan.beats[18].kind).toBe('rest');
    expect(laneSegments(plan, 18)).toEqual([]);
  });

  it('お手本は始めの間を空けてから、帯の形を実際の長さで並べる(D-039)', () => {
    const plan = expandProgram(program('slope'), CTX);
    const demo = plan.beats[0];
    if (demo.kind !== 'demo') throw new Error('お手本から始まるはず');
    const lead = DEMO_LEAD_SEC * 1000;
    const shape = HUM_HOLD_SEC * 1000;
    const segments = laneSegments(plan, 0);
    expect(segments.slice(0, 3)).toEqual([
      { start: lead, end: lead + shape, tone: plan.tones[demo.tones[0]], demo: true },
      { start: lead + shape, end: lead + 2 * shape, tone: plan.tones[demo.tones[1]], demo: true },
      { start: demo.ms, end: demo.ms + plan.beats[1].ms, tone: null },
    ]);
    // 縮めて動かすときは、お手本の間と長さも同じ割合で縮める。
    expect(laneSegments(plan, 0, (ms) => ms / 10)[0]).toMatchObject({ start: lead / 10, end: (lead + shape) / 10 });
  });
});

describe('お手本(D-039)', () => {
  it('滑らせるメニューは、始めと休憩のあとにお手本を聞かせる', () => {
    const plan = expandProgram(program('slope'), CTX);
    const demos = plan.beats.flatMap((b, i) => (b.kind === 'demo' ? [i] : []));
    expect(demos).toHaveLength(2);
    expect(demos[0]).toBe(0);
    expect(plan.beats[demos[1] - 1].kind).toBe('rest');
    const demo = plan.beats[0];
    if (demo.kind !== 'demo') throw new Error('お手本から始まるはず');
    expect(demo.tones.map((i) => plan.tones[i].label)).toEqual(['上へ滑らせる', '下へ滑らせる']);
    expect(demo.ms).toBe(DEMO_LEAD_SEC * 1000 + 2 * HUM_HOLD_SEC * 1000);
    expect(plan.beats[1]).toMatchObject({ kind: 'breath', rep: 0 });
  });

  it('同じ形が休憩なしで続くときは繰り返さず、形が変わるか途切れたら聞かせ直す', () => {
    const count = (blocks: Block[]) => expandProgram(customOf(blocks), CTX).beats.filter((b) => b.kind === 'demo').length;
    expect(count([glideBlock('up', 3)])).toBe(1);
    expect(count([glideBlock('up', 2, 60)])).toBe(2);
    expect(count([glideBlock('up'), glideBlock('down')])).toBe(2);
    expect(count([glideBlock('up'), glideBlock('up')])).toBe(1);
    const one = expandProgram(customOf([glideBlock('down')]), CTX).beats[0];
    expect(one.kind === 'demo' && one.tones).toHaveLength(1);
  });

  it('高さが一定のメニューにはお手本を入れない', () => {
    for (const id of ['simple', 'continuous', 'hill', 'build', 'interval', 'compare']) {
      expect(expandProgram(program(id), CTX).beats.some((b) => b.kind === 'demo')).toBe(false);
    }
  });

  it('お手本の音は、帯の中心と同じ道筋を続けてたどる', () => {
    const down: PlanTone = { ...GLIDE, hz: 300, toHz: 200 };
    const hold = MS * GLIDE_HOLD_RATIO;
    expect(demoPath([GLIDE, down], MS)).toEqual([
      { ms: 0, hz: 200 },
      { ms: hold, hz: 200 },
      { ms: MS - hold, hz: 300 },
      { ms: MS, hz: 300 },
      { ms: MS + hold, hz: 300 },
      { ms: 2 * MS - hold, hz: 200 },
      { ms: 2 * MS, hz: 200 },
    ]);
    // 形の境目で高さが飛ぶときは、すぐに移る。
    expect(demoPath([GLIDE, GLIDE], MS)[4]).toEqual({ ms: MS + 1, hz: 200 });
  });

  it('再開はお手本からも始められる', () => {
    const plan = expandProgram(program('slope'), CTX);
    const second = plan.beats.findIndex((b, i) => i > 0 && b.kind === 'demo');
    expect(resumeCursor(plan, second)).toBe(second);
    expect(resumeCursor(plan, second + 2)).toBe(second + 1);
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

  it('お手本の間は、これから始まるセットの丸をすべて「まだ」で見せる', () => {
    const plan = expandProgram(program('slope'), CTX);
    expect(setStamps(plan, 0, new Map())).toEqual(Array(6).fill('pending'));
    expect(setStamps(plan, 1, new Map())).toEqual(['current', ...Array(5).fill('pending')]);
  });

  it('連続型のように回数が多いときは並べない', () => {
    const plan = expandProgram(program('continuous'), CTX);
    expect(plan.beats[0].kind === 'breath' && plan.beats[0].reps).toBeGreaterThan(LANE_STAMP_MAX);
    expect(setStamps(plan, 0, new Map())).toEqual([]);
  });
});
