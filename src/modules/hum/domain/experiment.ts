import { addDays, dayDiff, latestOn, logicalDay, type LogEvent } from '../../../platform/events';
import {
  EXPERIMENT_ALPHA,
  EXPERIMENT_BLOCK_DAYS,
  EXPERIMENT_BLOCKS,
  EXPERIMENT_MIN_BLOCKS_PER_CONDITION,
} from '../rules';
import { countedSessionOn, KIND_MORNING, type MorningRecord } from './history';
import { shuffled } from './random';
import type { Tone } from './tones';

export const KIND_EXPERIMENT = 'experiment';

export type Condition = 'registered' | 'usual';

export const CONDITION_LABELS: Record<Condition, string> = { registered: '登録した音', usual: '楽な高さの音' };

// 比較してよいのはハミングの条件だけ。薬は対象にできない(HC-2)。
const ALLOWED_TARGETS = ['hum-tone'];

export interface ExperimentRecord {
  action: 'start' | 'stop';
  experimentId: string;
  target?: string;
  startDay?: string;
  blocks?: Condition[];
}

export interface Experiment {
  experimentId: string;
  target: string;
  startDay: string;
  blocks: Condition[];
}

export type StartResult = { ok: true; record: ExperimentRecord } | { ok: false; code: 'EXPERIMENT_NOT_ALLOWED' };

// 前半と後半にきれいに分かれると、回復の流れと区別できないので避ける。
function isSplit(blocks: Condition[]): boolean {
  const half = blocks.length / 2;
  return blocks.slice(0, half).every((c) => c === blocks[0]) && blocks.slice(half).every((c) => c === blocks[half]);
}

export function createExperiment(target: string, startDay: string, random: () => number = Math.random): StartResult {
  if (!ALLOWED_TARGETS.includes(target)) return { ok: false, code: 'EXPERIMENT_NOT_ALLOWED' };
  const half = EXPERIMENT_BLOCKS / 2;
  const base: Condition[] = [...Array<Condition>(half).fill('registered'), ...Array<Condition>(half).fill('usual')];
  let blocks = shuffled(base, random);
  while (isSplit(blocks)) blocks = shuffled(base, random);
  return { ok: true, record: { action: 'start', experimentId: crypto.randomUUID(), target, startDay, blocks } };
}

export function currentExperiment(events: LogEvent[]): Experiment | null {
  const last = events.findLast((e) => e.kind === KIND_EXPERIMENT)?.payload as ExperimentRecord | undefined;
  if (!last || last.action !== 'start') return null;
  return { experimentId: last.experimentId, target: last.target as string, startDay: last.startDay as string, blocks: last.blocks as Condition[] };
}

export const experimentDays = (experiment: Experiment) => experiment.blocks.length * EXPERIMENT_BLOCK_DAYS;

export const experimentEnd = (experiment: Experiment) => addDays(experiment.startDay, experimentDays(experiment) - 1);

export function conditionOn(experiment: Experiment, day: string): Condition | null {
  const elapsed = dayDiff(experiment.startDay, day);
  if (elapsed < 0) return null;
  return experiment.blocks[Math.floor(elapsed / EXPERIMENT_BLOCK_DAYS)] ?? null;
}

// 実験中で「楽な高さ」の日は、登録した音を使わない。planTones が楽な高さの1音に置き換える。
export function tonesForToday(events: LogEvent[], tones: Tone[], now: Date = new Date()): Tone[] {
  const experiment = currentExperiment(events);
  if (!experiment) return tones;
  return conditionOn(experiment, logicalDay(now)) === 'usual' ? [] : tones;
}

export interface BlockOutcome {
  condition: Condition;
  scores: number[];
}

// 前の条件の影響が残るので、各ブロックの初日は使わない。翌朝の記録がある実施日だけを数える。
export function blockOutcomes(experiment: Experiment, events: LogEvent[]): BlockOutcome[] {
  return experiment.blocks.map((condition, index) => {
    const scores: number[] = [];
    for (let offset = 1; offset < EXPERIMENT_BLOCK_DAYS; offset++) {
      const day = addDays(experiment.startDay, index * EXPERIMENT_BLOCK_DAYS + offset);
      const morning = latestOn<MorningRecord>(events, KIND_MORNING, addDays(day, 1));
      if (morning && countedSessionOn(events, day)) scores.push(morning.score);
    }
    return { condition, scores };
  });
}

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

// ブロックの割り当てをすべて入れ替えて、今の差以上になる割合を調べる。
export function permutationP(registered: number[], usual: number[]): number {
  const values = [...registered, ...usual];
  const observed = Math.abs(mean(registered) - mean(usual));
  let extreme = 0;
  let total = 0;
  for (let mask = 0; mask < 1 << values.length; mask++) {
    const a = values.filter((_, i) => mask & (1 << i));
    if (a.length !== registered.length) continue;
    const b = values.filter((_, i) => !(mask & (1 << i)));
    total++;
    if (Math.abs(mean(a) - mean(b)) >= observed - 1e-9) extreme++;
  }
  return extreme / total;
}

export type ExperimentResult =
  | { status: 'pending'; code: 'INSUFFICIENT_DAYS' }
  | { status: 'unusable'; code: 'TOO_MANY_MISSING' }
  | { status: 'difference' | 'no_difference'; registeredMean: number; usualMean: number; p: number };

export function analyzeExperiment(experiment: Experiment, events: LogEvent[], today: string): ExperimentResult {
  if (today <= experimentEnd(experiment)) return { status: 'pending', code: 'INSUFFICIENT_DAYS' };
  const outcomes = blockOutcomes(experiment, events).filter((b) => b.scores.length > 0);
  const of = (condition: Condition) => outcomes.filter((b) => b.condition === condition).map((b) => mean(b.scores));
  const registered = of('registered');
  const usual = of('usual');
  if (registered.length < EXPERIMENT_MIN_BLOCKS_PER_CONDITION || usual.length < EXPERIMENT_MIN_BLOCKS_PER_CONDITION) {
    return { status: 'unusable', code: 'TOO_MANY_MISSING' };
  }
  const p = permutationP(registered, usual);
  return {
    status: p < EXPERIMENT_ALPHA ? 'difference' : 'no_difference',
    registeredMean: Math.round(mean(registered) * 10) / 10,
    usualMean: Math.round(mean(usual) * 10) / 10,
    p,
  };
}
