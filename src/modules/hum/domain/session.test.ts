import {
  CONTINUOUS_HUMS_PER_MIN,
  HUM_REST_SEC,
} from '../rules';
import {
  buildPlan,
  DEFAULT_SESSION,
  estimateSeconds,
  planSummary,
  planTones,
  resumableProgress,
  resumeCursor,
  type PlanTone,
  type SessionSettings,
} from './session';
import type { Tone, VoiceProfile } from './tones';

const tone = (toneId: string, hz: number): Tone => ({
  toneId,
  site: 'cheek',
  hz,
  measuredHz: hz,
  levelDb: -45,
  strength: 2,
  clearness: null,
  method: 'self',
  registeredAt: '2026-11-04T10:00:00+09:00',
  history: [],
});

const PROFILE: VoiceProfile = { comfortHz: 139, lowHz: 98, falsettoHz: null };
const TWO: PlanTone[] = [
  { toneId: 'a', label: 'A', hz: 131 },
  { toneId: 'b', label: 'B', hz: 196 },
];
const settings = (patch: Partial<SessionSettings> = {}): SessionSettings => ({ ...DEFAULT_SESSION, ...patch });

describe('planTones', () => {
  it('並び順と無効化を反映する', () => {
    const tones = [tone('a', 131), tone('b', 196), tone('c', 262)];
    const planned = planTones(settings({ order: ['c', 'a'], disabled: ['b'] }), tones, PROFILE);
    expect(planned.map((t) => t.toneId)).toEqual(['c', 'a']);
  });

  it('登録がなければ楽な高さの1音で始める', () => {
    const planned = planTones(settings(), [], PROFILE);
    expect(planned).toHaveLength(1);
    expect(planned[0].toneId).toBeNull();
    expect(planned[0].hz).toBeCloseTo(138.59, 1);
  });

  it('声の高さが未測定でも基本の音で始められる(マイクなしの利用)', () => {
    expect(planTones(settings(), [], null)).toHaveLength(1);
  });
});

describe('buildPlan 短セット', () => {
  it('吸う拍とハミングを回数分並べ、休憩は音の間だけに入れる', () => {
    const { beats } = buildPlan(settings({ humsPerSet: 2 }), TWO);
    expect(beats.map((b) => b.kind)).toEqual(['breath', 'hum', 'breath', 'hum', 'rest', 'breath', 'hum', 'breath', 'hum']);
  });

  it('既定の休憩は3分', () => {
    const { beats } = buildPlan(settings(), TWO);
    expect(beats.find((b) => b.kind === 'rest')?.ms).toBe(HUM_REST_SEC * 1000);
  });

  it('休憩なしにもできる', () => {
    const { beats } = buildPlan(settings({ restSec: 0 }), TWO);
    expect(beats.some((b) => b.kind === 'rest')).toBe(false);
  });

  it('セットを増やすと同じ音の間にも休憩が入る', () => {
    const { beats } = buildPlan(settings({ humsPerSet: 1, setsPerTone: 2 }), TWO.slice(0, 1));
    expect(beats.map((b) => b.kind)).toEqual(['breath', 'hum', 'rest', 'breath', 'hum']);
  });
});

describe('buildPlan 連続型', () => {
  it('最初の音だけを、1分に18回のペースで続ける', () => {
    const plan = buildPlan(settings({ preset: 'continuous', continuousMin: 2 }), TWO);
    expect(plan.tones).toHaveLength(1);
    expect(plan.beats.filter((b) => b.kind === 'hum')).toHaveLength(2 * CONTINUOUS_HUMS_PER_MIN);
    expect(estimateSeconds(plan)).toBeCloseTo(120, 0);
  });

  it('基準音は最初の1回だけ鳴らす', () => {
    const { beats } = buildPlan(settings({ preset: 'continuous', continuousMin: 1 }), TWO);
    const breaths = beats.filter((b) => b.kind === 'breath');
    expect(breaths[0]).toMatchObject({ toneMs: 1000 });
    expect(breaths[1]).toMatchObject({ toneMs: 0 });
  });
});

it('概要を短く返す', () => {
  expect(planSummary(buildPlan(settings(), TWO))).toMatch(/^2音 約\d+分$/);
  expect(planSummary(buildPlan(settings({ preset: 'continuous' }), TWO))).toBe('連続型 約5分');
});

describe('途中からの再開', () => {
  const plan = buildPlan(settings({ humsPerSet: 2 }), TWO);
  const today = '2026-11-04';

  it('ハミングの途中なら、手前の吸う拍まで戻す', () => {
    expect(plan.beats[resumeCursor(plan, 3)].kind).toBe('breath');
    expect(resumeCursor(plan, 3)).toBe(2);
  });

  it('今日の同じ内容のときだけ再開できる', () => {
    const progress = { day: today, signature: plan.signature, cursor: 2, mode: 'tuner' as const };
    expect(resumableProgress(progress, plan, today)).toEqual(progress);
    expect(resumableProgress(progress, plan, '2026-11-05')).toBeNull();
    expect(resumableProgress({ ...progress, signature: 'changed' }, plan, today)).toBeNull();
    expect(resumableProgress({ ...progress, cursor: 0 }, plan, today)).toBeNull();
    expect(resumableProgress(undefined, plan, today)).toBeNull();
  });
});
