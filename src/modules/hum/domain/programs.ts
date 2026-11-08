import type { LogEvent } from '../../../platform/events';
import type { Settings } from '../../../platform/store';
import {
  BLOCK_MAX_HUMS,
  BLOCK_MAX_SETS,
  BLOCK_REST_CHOICES,
  BREATH_SEC,
  BREATH_TONE_SEC,
  COMFORT_TO_TOP_RATIO,
  COMPARE_HUMS,
  COMPARE_REST_SEC,
  CONTINUOUS_BREATH_SEC,
  CONTINUOUS_DEFAULT_HZ,
  CONTINUOUS_HUMS_PER_MIN,
  GLIDE_HIGH_SEMITONES,
  GLIDE_LOW_SEMITONES,
  HILL_HIGH_SEMITONES,
  HILL_LOW_SEMITONES,
  HUM_HOLD_SEC,
  HUM_REST_SEC,
  PROGRAM_MAX_BLOCKS,
  PROGRAM_MAX_CUSTOM,
  STEP_MAX_SEMITONES,
  STEP_MIN_SEMITONES,
  SWEEP_HIGH_LIMIT_HZ,
  SWEEP_LOW_LIMIT_HZ,
} from '../rules';
import { snapToSemitone } from './dsp';
import { conditionOn, currentExperiment, tonesForToday } from './experiment';
import { seededRandom, shuffled } from './random';
import {
  planTones,
  SETTING_SESSION,
  sessionSettings,
  type Beat,
  type Nose,
  type PlanTone,
  type SessionPlan,
  type SessionSettings,
} from './session';
import { currentTones, latestProfile, type VoiceProfile } from './tones';

export type { Nose } from './session';

export const SETTING_PROGRAMS = 'hum.programs';
export const SETTING_COMPARE_CONTACT = 'hum.compareContact';
export const SETTING_POSTURE_SEEN = 'hum.postureGuideSeenAt';

export const NOSES: Nose[] = ['open', 'narrow', 'pinch'];

// 高さの決め方。step と hill と glide は、楽な高さからの半音で表す。
export type PitchMode =
  | { kind: 'tones' }
  | { kind: 'step'; semitones: number }
  | { kind: 'hill' }
  | { kind: 'glide'; direction: 'up' | 'down' | 'alternate' };

export type Pace = 'standard' | 'continuous';

export interface Block {
  nose: Nose;
  pitch: PitchMode;
  hums: number;
  sets: number;
  restSec: number;
  rate?: boolean;
}

export interface Program {
  id: string;
  name: string;
  description: string;
  pace: Pace;
  shuffle: boolean;
  custom: boolean;
  blocks: Block[];
}

const block = (nose: Nose, pitch: PitchMode, hums: number, sets = 1, restSec = 0, rate = false): Block => ({
  nose,
  pitch,
  hums,
  sets,
  restSec,
  ...(rate ? { rate } : {}),
});

const COMFORT: PitchMode = { kind: 'step', semitones: 0 };

const preset = (id: string, name: string, description: string, blocks: Block[], extra: Partial<Program> = {}): Program => ({
  id,
  name,
  description,
  pace: 'standard',
  shuffle: false,
  custom: false,
  blocks,
  ...extra,
});

// 規定のメニュー。「いつもの」と「連続型」は、回数と休憩の設定をそのまま使う。
export function builtInPrograms(settings: SessionSettings): Program[] {
  return [
    preset('simple', 'いつもの', '今日の音を順に。登録がなければ楽な高さ', [
      block('open', { kind: 'tones' }, settings.humsPerSet, settings.setsPerTone, settings.restSec),
    ]),
    preset(
      'continuous',
      '連続型',
      '1分に18回のペースで続ける',
      [block('open', { kind: 'tones' }, Math.max(1, Math.round(settings.continuousMin * CONTINUOUS_HUMS_PER_MIN)))],
      { pace: 'continuous' },
    ),
    preset('hill', '山道', '1回ごとに高さが上がって下がる', [block('open', { kind: 'hill' }, 9, 2, 120)]),
    preset('slope', 'スロープ', '「んー」の中で高さを滑らせる', [block('open', { kind: 'glide', direction: 'alternate' }, 6, 2, 120)]),
    preset('build', 'だんだん強く', '開ける、狭める、つまむと強くする', [
      block('open', COMFORT, 4, 1, 60),
      block('narrow', COMFORT, 4, 1, 60),
      block('pinch', COMFORT, 3),
    ]),
    preset('interval', 'インターバル', 'つまむと流すを交互に。3分休んで3回', [
      block('pinch', COMFORT, 4, 3, HUM_REST_SEC),
    ]),
    preset(
      'compare',
      '構えくらべ',
      '3つの構えの震え方を比べる',
      NOSES.map((nose) => block(nose, COMFORT, COMPARE_HUMS, 1, COMPARE_REST_SEC, true)),
      { shuffle: true },
    ),
  ];
}

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, n));
};

function normalizePitch(raw: unknown): PitchMode {
  const pitch = raw as Partial<PitchMode> | undefined;
  if (pitch?.kind === 'tones' || pitch?.kind === 'hill') return { kind: pitch.kind };
  if (pitch?.kind === 'glide') {
    const direction = (pitch as { direction?: unknown }).direction;
    return { kind: 'glide', direction: direction === 'up' || direction === 'down' ? direction : 'alternate' };
  }
  const semitones = (pitch as { semitones?: unknown } | undefined)?.semitones;
  return { kind: 'step', semitones: clampInt(semitones, STEP_MIN_SEMITONES, STEP_MAX_SEMITONES, 0) };
}

function normalizeBlock(raw: unknown): Block {
  const b = (raw ?? {}) as Partial<Block>;
  const restSec = BLOCK_REST_CHOICES.includes(b.restSec as number) ? (b.restSec as number) : 0;
  return {
    nose: NOSES.includes(b.nose as Nose) ? (b.nose as Nose) : 'open',
    pitch: normalizePitch(b.pitch),
    hums: clampInt(b.hums, 1, BLOCK_MAX_HUMS, 5),
    sets: clampInt(b.sets, 1, BLOCK_MAX_SETS, 1),
    restSec,
  };
}

// 自分で作ったメニュー。読み込んだ記録から来ることもあるので、値を範囲に収めてから使う。
export function normalizeProgram(raw: unknown): Program | null {
  const p = (raw ?? {}) as Partial<Program>;
  if (typeof p.id !== 'string' || !Array.isArray(p.blocks) || p.blocks.length === 0) return null;
  const name = typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 20) : '自分のメニュー';
  return {
    id: p.id,
    name,
    description: '自分で作ったメニュー',
    pace: 'standard',
    shuffle: false,
    custom: true,
    blocks: p.blocks.slice(0, PROGRAM_MAX_BLOCKS).map(normalizeBlock),
  };
}

export function customPrograms(settings: Settings): Program[] {
  const stored = settings[SETTING_PROGRAMS];
  if (!Array.isArray(stored)) return [];
  return stored
    .slice(0, PROGRAM_MAX_CUSTOM)
    .map(normalizeProgram)
    .filter((p): p is Program => p != null);
}

// 規定のメニューを元に作るときは、高さの指定と構えをそのまま写す。
export function copyAsCustom(program: Program, id: string): Program {
  return {
    ...program,
    id,
    name: `${program.name}(自分用)`.slice(0, 20),
    description: '自分で作ったメニュー',
    pace: 'standard',
    shuffle: false,
    custom: true,
    blocks: program.blocks.map((b) => normalizeBlock({ ...b, hums: Math.min(b.hums, BLOCK_MAX_HUMS) })),
  };
}

export interface PitchContext {
  tones: PlanTone[];
  comfortHz: number;
  lowHz: number;
  highHz: number;
}

export function pitchContext(tones: PlanTone[], profile: VoiceProfile | null): PitchContext {
  const comfortHz = profile ? snapToSemitone(profile.comfortHz) : CONTINUOUS_DEFAULT_HZ;
  return {
    tones,
    comfortHz,
    lowHz: Math.max(SWEEP_LOW_LIMIT_HZ, profile?.lowHz ?? comfortHz / 2 ** (5 / 12)),
    highHz: Math.min(SWEEP_HIGH_LIMIT_HZ, comfortHz * COMFORT_TO_TOP_RATIO),
  };
}

// 楽な高さから半音ずらす。声域の外には出さない。
function shifted(ctx: PitchContext, semitones: number): number {
  const hz = snapToSemitone(ctx.comfortHz * 2 ** (semitones / 12));
  return Math.max(ctx.lowHz, Math.min(ctx.highHz, hz));
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function hillOffsets(hums: number): number[] {
  if (hums <= 1) return [0];
  return Array.from({ length: hums }, (_, i) => {
    const t = i / (hums - 1);
    return Math.round(HILL_LOW_SEMITONES + (HILL_HIGH_SEMITONES - HILL_LOW_SEMITONES) * (1 - Math.abs(2 * t - 1)));
  });
}

// ブロックの1回分(1つの音の1セット)ごとに、各回の高さを並べる。
function blockParts(b: Block, ctx: PitchContext, pace: Pace): PlanTone[][] {
  const repeat = (tone: PlanTone) => Array.from({ length: b.hums }, () => tone);
  switch (b.pitch.kind) {
    case 'tones':
      return (pace === 'continuous' ? ctx.tones.slice(0, 1) : ctx.tones).map(repeat);
    case 'step': {
      const s = b.pitch.semitones;
      return [repeat({ toneId: null, label: s === 0 ? '楽な高さ' : `楽な高さ ${signed(s)}半音`, hz: shifted(ctx, s) })];
    }
    case 'hill':
      return [hillOffsets(b.hums).map((s) => ({ toneId: null, label: '山道', hz: shifted(ctx, s) }))];
    case 'glide': {
      const up: PlanTone = { toneId: null, label: '上へ滑らせる', hz: shifted(ctx, GLIDE_LOW_SEMITONES), toHz: shifted(ctx, GLIDE_HIGH_SEMITONES) };
      const down: PlanTone = { toneId: null, label: '下へ滑らせる', hz: up.toHz as number, toHz: up.hz };
      const direction = b.pitch.direction;
      return [Array.from({ length: b.hums }, (_, i) => (direction === 'down' || (direction === 'alternate' && i % 2) ? down : up))];
    }
  }
}

// メニューを拍の列に展開する。つまむ「んー」のあとには、必ず鼻を開けて流す「んー」を入れる(U-18)。
export function expandProgram(program: Program, ctx: PitchContext, random: () => number = Math.random): SessionPlan {
  const tones: PlanTone[] = [];
  const indexOf = (tone: PlanTone) => {
    const key = (t: PlanTone) => `${t.toneId}|${t.label}|${Math.round(t.hz)}|${Math.round(t.toHz ?? 0)}`;
    const found = tones.findIndex((t) => key(t) === key(tone));
    if (found >= 0) return found;
    tones.push(tone);
    return tones.length - 1;
  };
  const blocks = program.shuffle ? shuffled(program.blocks, random) : program.blocks;
  const continuous = program.pace === 'continuous';
  const humMs = continuous ? Math.round(60_000 / CONTINUOUS_HUMS_PER_MIN - CONTINUOUS_BREATH_SEC * 1000) : HUM_HOLD_SEC * 1000;
  const breathMs = (continuous ? CONTINUOUS_BREATH_SEC : BREATH_SEC) * 1000;

  type Chunk = { block: Block; blockIndex: number; hums: PlanTone[]; lastOfBlock: boolean };
  const chunks: Chunk[] = [];
  blocks.forEach((b, blockIndex) => {
    const parts = blockParts(b, ctx, program.pace);
    parts.forEach((hums, partIndex) => {
      for (let set = 0; set < b.sets; set++) {
        chunks.push({ block: b, blockIndex, hums, lastOfBlock: partIndex === parts.length - 1 && set === b.sets - 1 });
      }
    });
  });

  const beats: Beat[] = [];
  chunks.forEach((chunk, chunkIndex) => {
    const { block: b, hums } = chunk;
    hums.forEach((tone, rep) => {
      const toneIndex = indexOf(tone);
      const toneMs = continuous && rep > 0 ? 0 : Math.min(BREATH_TONE_SEC * 1000, breathMs);
      beats.push({ kind: 'breath', toneIndex, rep, reps: hums.length, ms: breathMs, toneMs, nose: b.nose });
      beats.push({ kind: 'hum', toneIndex, rep, reps: hums.length, ms: humMs, nose: b.nose, part: chunk.blockIndex });
      if (b.nose === 'pinch') {
        beats.push({ kind: 'breath', toneIndex, rep, reps: hums.length, ms: BREATH_SEC * 1000, toneMs: 0, nose: 'open', flush: true });
        beats.push({ kind: 'hum', toneIndex, rep, reps: hums.length, ms: HUM_HOLD_SEC * 1000, nose: 'open', flush: true, part: chunk.blockIndex });
      }
    });
    const last = beats.at(-1) as Beat;
    if (chunk.lastOfBlock && b.rate) beats.push({ kind: 'rate', toneIndex: last.toneIndex, ms: 0, nose: b.nose, part: chunk.blockIndex });
    if (chunkIndex < chunks.length - 1 && b.restSec > 0) beats.push({ kind: 'rest', toneIndex: last.toneIndex, ms: b.restSec * 1000 });
  });

  const signature = JSON.stringify([program.id, program.pace, blocks, tones.map((t) => [Math.round(t.hz), Math.round(t.toHz ?? 0)])]);
  return { preset: continuous ? 'continuous' : 'short', programId: program.id, name: program.name, tones, beats, signature };
}

// 以前の2つのプリセット(短セットと連続型)の組み立て。
export function buildPlan(settings: SessionSettings, tones: PlanTone[]): SessionPlan {
  const [simple, continuous] = builtInPrograms(settings);
  return expandProgram(settings.preset === 'continuous' ? continuous : simple, pitchContext(tones, null));
}

export function allPrograms(settings: Settings): Program[] {
  return [...builtInPrograms(sessionSettings(settings[SETTING_SESSION])), ...customPrograms(settings)];
}

// 比較実験の日は、比べる音が変わらないよう「いつもの」で行う。
export function selectedProgram(events: LogEvent[], settings: Settings, day: string): { program: Program; locked: boolean } {
  const stored = sessionSettings(settings[SETTING_SESSION]);
  const programs = allPrograms(settings);
  const experiment = currentExperiment(events);
  if (experiment && conditionOn(experiment, day)) return { program: programs[0], locked: true };
  const fallback = stored.preset === 'continuous' ? programs[1] : programs[0];
  return { program: programs.find((p) => p.id === stored.programId) ?? fallback, locked: false };
}

export function todayPlan(events: LogEvent[], settings: Settings, day: string): SessionPlan {
  const stored = sessionSettings(settings[SETTING_SESSION]);
  const { program } = selectedProgram(events, settings, day);
  const profile = latestProfile(events);
  const tones = planTones(stored, tonesForToday(events, currentTones(events)), profile);
  return expandProgram(program, pitchContext(tones, profile), seededRandom(`${day}:${program.id}`));
}

export const usesPosture = (plan: SessionPlan) => plan.beats.some((b) => b.kind === 'hum' && b.nose !== 'open');

export function programSummary(plan: SessionPlan): string {
  const minutes = Math.max(1, Math.round(plan.beats.reduce((sum, b) => sum + b.ms, 0) / 60_000));
  if (plan.programId === 'simple') return `いつもの・${plan.tones.length}音 約${minutes}分`;
  return `${plan.name} 約${minutes}分`;
}

export function programMinutes(program: Program, ctx: PitchContext): number {
  const plan = expandProgram(program, ctx, () => 0);
  return Math.max(1, Math.round(plan.beats.reduce((sum, b) => sum + b.ms, 0) / 60_000));
}
