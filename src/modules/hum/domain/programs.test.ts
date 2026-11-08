import { createEvent } from '../../../platform/events';
import { NOSE_CUES, POSTURE_LINES } from '../copy';
import { BLOCK_MAX_HUMS, COMPARE_HUMS, HILL_HIGH_SEMITONES, HILL_LOW_SEMITONES, PROGRAM_MAX_BLOCKS } from '../rules';
import { createExperiment, KIND_EXPERIMENT } from './experiment';
import {
  builtInPrograms,
  customPrograms,
  expandProgram,
  hillOffsets,
  NOSES,
  normalizeProgram,
  pitchContext,
  programSummary,
  selectedProgram,
  SETTING_PROGRAMS,
  todayPlan,
  usesPosture,
  type Block,
  type Program,
} from './programs';
import { seededRandom } from './random';
import { DEFAULT_SESSION, SETTING_SESSION, type Beat, type PlanTone } from './session';
import { KIND_PROFILE, type VoiceProfile } from './tones';

const PROFILE: VoiceProfile = { comfortHz: 139, lowHz: 98, falsettoHz: null };
const TONES: PlanTone[] = [
  { toneId: 'a', label: 'A', hz: 131 },
  { toneId: 'b', label: 'B', hz: 196 },
];
const CTX = pitchContext(TONES, PROFILE);
const BUILT_IN = builtInPrograms(DEFAULT_SESSION);
const byId = (id: string) => BUILT_IN.find((p) => p.id === id) as Program;
const hums = (beats: Beat[]) => beats.filter((b): b is Extract<Beat, { kind: 'hum' }> => b.kind === 'hum');

// つまむ「んー」の直後には、鼻を離して吸う拍と、鼻を開けて流す「んー」が必ず続く(U-18)。
function expectFlushAfterPinch(beats: Beat[]) {
  beats.forEach((beat, i) => {
    if (beat.kind === 'hum' && beat.nose === 'pinch') {
      expect(beats[i + 1]).toMatchObject({ kind: 'breath', nose: 'open', flush: true });
      expect(beats[i + 2]).toMatchObject({ kind: 'hum', nose: 'open', flush: true });
    }
  });
}

function randomProgram(random: () => number): Program {
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const blocks: Block[] = Array.from({ length: 1 + Math.floor(random() * 4) }, () => ({
    nose: pick(NOSES),
    pitch: pick([{ kind: 'tones' }, { kind: 'step', semitones: Math.round(random() * 12) - 5 }, { kind: 'hill' }, { kind: 'glide', direction: pick(['up', 'down', 'alternate'] as const) }]),
    hums: 1 + Math.floor(random() * 6),
    sets: 1 + Math.floor(random() * 3),
    restSec: pick([0, 30, 60]),
  }));
  return normalizeProgram({ id: 'x', name: 'x', blocks }) as Program;
}

describe('規定のメニュー', () => {
  it('どれも展開でき、休憩で終わらない', () => {
    for (const program of BUILT_IN) {
      const { beats } = expandProgram(program, CTX, () => 0.3);
      expect(beats.length, program.id).toBeGreaterThan(0);
      expect(beats.at(-1)?.kind, program.id).not.toBe('rest');
    }
  });

  it('つまむ構えのあとには必ず鼻を開けて流す(規定と自分のメニューの両方)', () => {
    for (const program of BUILT_IN) expectFlushAfterPinch(expandProgram(program, CTX).beats);
    const random = seededRandom('flush');
    for (let i = 0; i < 200; i++) expectFlushAfterPinch(expandProgram(randomProgram(random), CTX, random).beats);
  });

  it('つまむ合図には口を開けることが入り、鼻と口の両方を閉じる指示はない', () => {
    expect(NOSE_CUES.pinch).toContain('口を小さく開け');
    for (const line of [...Object.values(NOSE_CUES), ...POSTURE_LINES]) {
      for (const phrase of ['口を閉じて鼻をつまむ', '口を閉じたまま鼻をつまむ', '鼻と口を閉じ', '口も閉じ']) expect(line).not.toContain(phrase);
    }
  });

  it('山道は低い所から上がって、また下がる', () => {
    const offsets = hillOffsets(9);
    expect(offsets[0]).toBe(HILL_LOW_SEMITONES);
    expect(offsets.at(-1)).toBe(HILL_LOW_SEMITONES);
    expect(Math.max(...offsets)).toBe(HILL_HIGH_SEMITONES);
    expect(offsets[4]).toBe(HILL_HIGH_SEMITONES);
    const plan = expandProgram(byId('hill'), CTX);
    const first = hums(plan.beats).slice(0, 9).map((b) => plan.tones[b.toneIndex].hz);
    expect(first[4]).toBeGreaterThan(first[0]);
    expect(first[8]).toBeCloseTo(first[0], 5);
  });

  it('スロープは上と下を交互に滑らせ、高さは声域の中に収める', () => {
    const plan = expandProgram(byId('slope'), CTX);
    const [up, down] = hums(plan.beats).slice(0, 2).map((b) => plan.tones[b.toneIndex]);
    expect(up.toHz).toBeGreaterThan(up.hz);
    expect(down.toHz).toBeLessThan(down.hz);
    for (const tone of plan.tones) {
      for (const hz of [tone.hz, tone.toHz as number]) {
        expect(hz).toBeGreaterThanOrEqual(CTX.lowHz);
        expect(hz).toBeLessThanOrEqual(CTX.highHz);
      }
    }
  });

  it('だんだん強くは、開ける、狭める、つまむの順に進む', () => {
    const noses = hums(expandProgram(byId('build'), CTX).beats)
      .filter((b) => !b.flush)
      .map((b) => b.nose);
    expect([...new Set(noses)]).toEqual(['open', 'narrow', 'pinch']);
  });

  it('構えくらべは3つの構えを1回ずつ評価し、順番は種で決まる', () => {
    const a = expandProgram(byId('compare'), CTX, seededRandom('2026-11-08:compare'));
    const b = expandProgram(byId('compare'), CTX, seededRandom('2026-11-08:compare'));
    const rates = a.beats.filter((x) => x.kind === 'rate').map((x) => (x as Extract<Beat, { kind: 'rate' }>).nose);
    expect(rates.sort()).toEqual([...NOSES].sort());
    expect(a.signature).toBe(b.signature);
    expect(hums(a.beats).filter((x) => !x.flush)).toHaveLength(3 * COMPARE_HUMS);
  });

  it('メニューが変われば、途中からの再開に使う印も変わる', () => {
    expect(expandProgram(byId('hill'), CTX).signature).not.toBe(expandProgram(byId('slope'), CTX).signature);
  });

  it('いつものは、登録した音の数と時間を示す', () => {
    expect(programSummary(expandProgram(byId('simple'), CTX))).toMatch(/^いつもの・2音 約\d+分$/);
    expect(programSummary(expandProgram(byId('hill'), CTX))).toMatch(/^山道 約\d+分$/);
    expect(usesPosture(expandProgram(byId('simple'), CTX))).toBe(false);
    expect(usesPosture(expandProgram(byId('interval'), CTX))).toBe(true);
  });
});

describe('自分のメニュー', () => {
  it('読み込んだ値は範囲に収め、壊れたものは捨てる', () => {
    const program = normalizeProgram({
      id: 'c',
      name: '  朝用  ',
      blocks: [{ nose: 'mouth-closed', pitch: { kind: 'step', semitones: 40 }, hums: 999, sets: -1, restSec: 7, rate: true }],
    });
    expect(program).toMatchObject({ name: '朝用', custom: true, shuffle: false });
    expect(program?.blocks[0]).toEqual({ nose: 'open', pitch: { kind: 'step', semitones: 7 }, hums: BLOCK_MAX_HUMS, sets: 1, restSec: 0 });
    expect(normalizeProgram({ id: 'c', blocks: [] })).toBeNull();
    expect(normalizeProgram({ blocks: [{}] })).toBeNull();
    const long = normalizeProgram({ id: 'l', blocks: Array.from({ length: 30 }, () => ({})) });
    expect(long?.blocks).toHaveLength(PROGRAM_MAX_BLOCKS);
  });

  it('設定に保存したものを一覧に出す', () => {
    const settings = { [SETTING_PROGRAMS]: [{ id: 'c', name: '朝用', blocks: [{ nose: 'narrow', pitch: { kind: 'hill' }, hums: 5 }] }, 'broken'] };
    expect(customPrograms(settings).map((p) => p.name)).toEqual(['朝用']);
  });
});

describe('今日のメニュー', () => {
  const profile = createEvent(KIND_PROFILE, PROFILE, new Date('2026-11-01T10:00:00'));

  it('選んだメニューで展開し、ホームと実行画面で同じ順番になる', () => {
    const settings = { [SETTING_SESSION]: { ...DEFAULT_SESSION, programId: 'compare' } };
    const a = todayPlan([profile], settings, '2026-11-08');
    const b = todayPlan([profile], settings, '2026-11-08');
    expect(a.programId).toBe('compare');
    expect(a.signature).toBe(b.signature);
  });

  it('比較実験の日は「いつもの」で行う', () => {
    const start = createExperiment('hum-tone', '2026-11-08', () => 0.4);
    if (!start.ok) throw new Error('experiment');
    const events = [profile, createEvent(KIND_EXPERIMENT, start.record, new Date('2026-11-08T09:00:00'))];
    const settings = { [SETTING_SESSION]: { ...DEFAULT_SESSION, programId: 'hill' } };
    expect(selectedProgram(events, settings, '2026-11-09')).toMatchObject({ program: { id: 'simple' }, locked: true });
    expect(selectedProgram([profile], settings, '2026-11-09')).toMatchObject({ program: { id: 'hill' }, locked: false });
  });

  it('選んだメニューが消えていたら、以前の設定(短セットか連続型)に戻る', () => {
    const settings = { [SETTING_SESSION]: { ...DEFAULT_SESSION, preset: 'continuous', programId: 'gone' } };
    expect(selectedProgram([profile], settings, '2026-11-09').program.id).toBe('continuous');
  });
});
