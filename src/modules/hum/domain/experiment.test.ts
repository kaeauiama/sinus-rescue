import { addDays, createEvent, type LogEvent } from '../../../platform/events';
import { EXPERIMENT_BLOCK_DAYS, EXPERIMENT_BLOCKS } from '../rules';
import {
  analyzeExperiment,
  blockOutcomes,
  conditionOn,
  createExperiment,
  currentExperiment,
  experimentEnd,
  KIND_EXPERIMENT,
  permutationP,
  tonesForToday,
  type Condition,
  type Experiment,
} from './experiment';
import { KIND_MORNING } from './history';
import { KIND_SESSION } from './session';
import type { Tone } from './tones';

const START = '2026-11-01';
const BLOCKS: Condition[] = ['registered', 'usual', 'usual', 'registered', 'usual', 'registered', 'registered', 'usual'];
const experiment: Experiment = { experimentId: 'e', target: 'hum-tone', startDay: START, blocks: BLOCKS };

const at = (day: string) => new Date(`${day}T12:00:00`);
const session = (day: string) => createEvent(KIND_SESSION, { completed: true, durationSec: 300 }, at(day));
const morning = (day: string, score: number) => createEvent(KIND_MORNING, { score }, at(day));

// 各ブロックの実施日と翌朝を、条件ごとの点数で埋める。
function fill(scoreOf: (condition: Condition, blockIndex: number) => number, skip: (blockIndex: number) => boolean = () => false): LogEvent[] {
  return BLOCKS.flatMap((condition, index) => {
    if (skip(index)) return [];
    return [1, 2].flatMap((offset) => {
      const day = addDays(START, index * EXPERIMENT_BLOCK_DAYS + offset);
      return [session(day), morning(addDays(day, 1), scoreOf(condition, index))];
    });
  });
}

const AFTER_END = addDays(experimentEnd(experiment), 1);

describe('実験の対象(HC-2)', () => {
  it.each(['steroid', 'decongestant', 'antibiotic', 'medication', 'hum-tone-and-steroid', ''])(
    '%s は対象にできない',
    (target) => {
      expect(createExperiment(target, START)).toEqual({ ok: false, code: 'EXPERIMENT_NOT_ALLOWED' });
    },
  );

  it('ハミングの条件は対象にできる', () => {
    expect(createExperiment('hum-tone', START).ok).toBe(true);
  });
});

describe('割り当て', () => {
  const blocksOf = (random: () => number) => {
    const result = createExperiment('hum-tone', START, random);
    if (!result.ok) throw new Error('unexpected');
    return result.record.blocks as Condition[];
  };

  it('2条件を同じ数にする', () => {
    const blocks = blocksOf(Math.random);
    expect(blocks).toHaveLength(EXPERIMENT_BLOCKS);
    expect(blocks.filter((c) => c === 'registered')).toHaveLength(EXPERIMENT_BLOCKS / 2);
  });

  it('前半と後半に分かれる割り当てを避ける', () => {
    for (let i = 0; i < 200; i++) {
      const blocks = blocksOf(Math.random);
      expect(new Set(blocks.slice(0, EXPERIMENT_BLOCKS / 2)).size).toBe(2);
    }
  });
});

describe('今日の条件', () => {
  it('3日ごとに条件が変わる', () => {
    expect(conditionOn(experiment, START)).toBe('registered');
    expect(conditionOn(experiment, addDays(START, 2))).toBe('registered');
    expect(conditionOn(experiment, addDays(START, 3))).toBe('usual');
  });

  it('期間の外では条件がない', () => {
    expect(conditionOn(experiment, addDays(START, -1))).toBeNull();
    expect(conditionOn(experiment, AFTER_END)).toBeNull();
  });

  const tones = [{ toneId: 't' } as Tone];
  const started = (day: string) => createEvent(KIND_EXPERIMENT, { action: 'start', experimentId: 'e', target: 'hum-tone', startDay: day, blocks: BLOCKS }, at(day));

  it('楽な高さの日は登録した音を使わない', () => {
    expect(tonesForToday([started(START)], tones, at(addDays(START, 3)))).toEqual([]);
    expect(tonesForToday([started(START)], tones, at(START))).toEqual(tones);
  });

  it('実験していなければ登録した音を使う', () => {
    expect(tonesForToday([], tones, at(START))).toEqual(tones);
  });

  it('やめると実験なしに戻る', () => {
    const stopped = createEvent(KIND_EXPERIMENT, { action: 'stop', experimentId: 'e' }, at(START));
    expect(currentExperiment([started(START), stopped])).toBeNull();
    expect(tonesForToday([started(START), stopped], tones, at(addDays(START, 3)))).toEqual(tones);
  });
});

describe('比べる記録', () => {
  it('各ブロックの初日と、実施しなかった日を除く', () => {
    const events = [
      session(START),
      morning(addDays(START, 1), 9),
      session(addDays(START, 1)),
      morning(addDays(START, 2), 4),
      morning(addDays(START, 3), 9),
    ];
    expect(blockOutcomes(experiment, events)[0]).toEqual({ condition: 'registered', scores: [4] });
  });

  it('翌朝の記録がない日を除く', () => {
    expect(blockOutcomes(experiment, [session(addDays(START, 1))])[0].scores).toEqual([]);
  });
});

describe('並べ替え検定', () => {
  it('完全に分かれたときが最小で、2/70になる', () => {
    expect(permutationP([8, 8, 8, 8], [2, 2, 2, 2])).toBeCloseTo(2 / 70);
    expect(permutationP([8, 7, 8, 7], [2, 3, 2, 3])).toBeCloseTo(2 / 70);
  });

  it('差がなければ1になる', () => {
    expect(permutationP([5, 5, 5, 5], [5, 5, 5, 5])).toBe(1);
  });
});

describe('結果', () => {
  it('期間が終わるまでは出さない', () => {
    const events = fill((c) => (c === 'registered' ? 8 : 2));
    expect(analyzeExperiment(experiment, events, experimentEnd(experiment))).toEqual({ status: 'pending', code: 'INSUFFICIENT_DAYS' });
  });

  it('大きな差があれば、差ありと返す', () => {
    const result = analyzeExperiment(experiment, fill((c) => (c === 'registered' ? 8 : 2)), AFTER_END);
    expect(result).toMatchObject({ status: 'difference', registeredMean: 8, usualMean: 2 });
  });

  it('向きが逆でも差として返す', () => {
    const result = analyzeExperiment(experiment, fill((c) => (c === 'registered' ? 2 : 8)), AFTER_END);
    expect(result).toMatchObject({ status: 'difference', registeredMean: 2, usualMean: 8 });
  });

  it('条件と無関係な揺れでは、差は検出できずと返す', () => {
    const result = analyzeExperiment(experiment, fill((_, index) => [5, 6, 4, 6, 5, 4, 6, 5][index]), AFTER_END);
    expect(result.status).toBe('no_difference');
  });

  it('欠けが多いと理由を返して判定しない', () => {
    const events = fill((c) => (c === 'registered' ? 8 : 2), (index) => index > 2);
    expect(analyzeExperiment(experiment, events, AFTER_END)).toEqual({ status: 'unusable', code: 'TOO_MANY_MISSING' });
  });
});
