// 流れる帯(D-038)。今日のハミングの目標を、右から流れてくる帯として示し、帯の中にいた割合で判定する。
import {
  GLIDE_HOLD_RATIO,
  GLIDE_TOLERANCE_CENTS,
  GRADE_BAD_RATIO,
  GRADE_GOOD_RATIO,
  GRADE_GREAT_RATIO,
  LANE_STAMP_MAX,
  OCTAVE_TOLERANCE_CENTS,
  STEADY_TOLERANCE_CENTS,
} from '../rules';
import { centsBetween, type CapturePoint } from './dsp';
import type { Beat, PlanTone, SessionPlan } from './session';

export type Grade = 'GREAT' | 'GOOD' | 'BAD' | 'POOR';
export const GRADES: Grade[] = ['GREAT', 'GOOD', 'BAD', 'POOR'];

// 帯の片側の幅。高さが動く回は追いにくいので広くする。
export const bandCents = (tone: PlanTone): number => (tone.toHz ? GLIDE_TOLERANCE_CENTS : STEADY_TOLERANCE_CENTS);

// 始まりから t ミリ秒での帯の中心。滑らせる回は始めと終わりで止まり、その間を半音の刻みで等速に動く。
export function bandHz(tone: PlanTone, t: number, durationMs: number): number {
  if (!tone.toHz) return tone.hz;
  const hold = durationMs * GLIDE_HOLD_RATIO;
  const f = Math.max(0, Math.min(1, (t - hold) / (durationMs - 2 * hold)));
  return tone.hz * (tone.toHz / tone.hz) ** f;
}

// お手本で鳴らす高さの道筋。帯の中心(bandHz)と同じ形を、続けてたどる。ms はお手本の帯の始まりから。
export function demoPath(tones: PlanTone[], shapeMs: number): { ms: number; hz: number }[] {
  const hold = shapeMs * GLIDE_HOLD_RATIO;
  const path: { ms: number; hz: number }[] = [];
  tones.forEach((tone, k) => {
    const base = k * shapeMs;
    const to = tone.toHz ?? tone.hz;
    const last = path.at(-1);
    if (!last) path.push({ ms: base, hz: tone.hz });
    else if (last.hz !== tone.hz) path.push({ ms: base + 1, hz: tone.hz });
    path.push({ ms: base + hold, hz: tone.hz }, { ms: base + shapeMs - hold, hz: to }, { ms: base + shapeMs, hz: to });
  });
  return path;
}

// ちょうど1オクターブずれた声は、検出の誤りのことも多いので、帯の高さに重ねて扱う。
export function foldOctave(cents: number): number {
  return Math.abs(Math.abs(cents) - 1200) <= OCTAVE_TOLERANCE_CENTS ? cents - Math.sign(cents) * 1200 : cents;
}

// 帯の中にいた割合。声が出ていない時間も外として数える。t は検出の遅れを引いたあとの時刻。
export function judgeHum(points: CapturePoint[], tone: PlanTone, durationMs: number, onsetMs: number): number {
  const counted = points.filter((p) => p.t >= onsetMs && p.t <= durationMs);
  if (!counted.length) return 0;
  const tolerance = bandCents(tone);
  const inside = counted.filter(
    (p) => p.f0 != null && Math.abs(foldOctave(centsBetween(p.f0, bandHz(tone, p.t, durationMs)))) <= tolerance,
  );
  return inside.length / counted.length;
}

export function gradeOf(ratio: number): Grade {
  if (ratio >= GRADE_GREAT_RATIO) return 'GREAT';
  if (ratio >= GRADE_GOOD_RATIO) return 'GOOD';
  if (ratio >= GRADE_BAD_RATIO) return 'BAD';
  return 'POOR';
}

// 帯に並べる1区間。start と end は今の拍の始まりを0としたミリ秒で、tone がなければ息を吸う間。
// demo はお手本の帯で、声は出さずに聞くだけ。
export interface LaneSegment {
  start: number;
  end: number;
  tone: PlanTone | null;
  demo?: boolean;
}

type FlowBeat = Extract<Beat, { kind: 'breath' | 'hum' | 'demo' }>;

const flows = (beat: Beat | undefined): beat is FlowBeat =>
  beat?.kind === 'breath' || beat?.kind === 'hum' || beat?.kind === 'demo';

// 今の拍の前後で、休憩や評価で途切れずに続く拍を並べる。先の帯の表示と、通り過ぎた帯の表示に使う。
// scale は拍の長さの換算(動作確認で待ち時間を縮めるときに使う)。
export function laneSegments(plan: SessionPlan, cursor: number, scale: (ms: number) => number = (ms) => ms): LaneSegment[] {
  const beats = plan.beats;
  if (!flows(beats[cursor])) return [];
  let first = cursor;
  while (flows(beats[first - 1])) first--;
  let offset = 0;
  for (let i = first; i < cursor; i++) offset -= scale(beats[i].ms);
  const segments: LaneSegment[] = [];
  for (let i = first; flows(beats[i]); i++) {
    const beat = beats[i];
    const ms = scale(beat.ms);
    if (beat.kind === 'demo') {
      // 始めの間は何も置かず、帯が今の線に届くのを待つ。
      const lead = scale(beat.leadMs);
      const shape = scale(beat.shapeMs);
      beat.tones.forEach((toneIndex, k) => {
        const start = offset + lead + k * shape;
        segments.push({ start, end: start + shape, tone: plan.tones[toneIndex], demo: true });
      });
    } else {
      segments.push({ start: offset, end: offset + ms, tone: beat.kind === 'hum' ? plan.tones[beat.toneIndex] : null });
    }
    offset += ms;
  }
  return segments;
}

// 判定するのは、つまんだあとに鼻を開けて流す回を除いた「んー」。
export const isJudgedHum = (beat: Beat | undefined): beat is Extract<Beat, { kind: 'hum' }> =>
  beat?.kind === 'hum' && !beat.flush;

// 今のセットの結果の丸。終わった回は判定、今の回は current、まだの回は pending。回数が多いときは並べない。
export type Stamp = Grade | 'current' | 'pending';

export function setStamps(plan: SessionPlan, cursor: number, grades: ReadonlyMap<number, Grade>): Stamp[] {
  const beat = plan.beats[cursor];
  if (!flows(beat)) return [];
  // お手本の間は、これから始まるセットの丸をすべて「まだ」で見せる。
  if (beat.kind === 'demo') {
    const next = plan.beats[cursor + 1];
    return next?.kind === 'breath' && next.reps <= LANE_STAMP_MAX ? Array<Stamp>(next.reps).fill('pending') : [];
  }
  if (beat.reps > LANE_STAMP_MAX) return [];
  const stamps: Stamp[] = Array.from({ length: beat.reps }, (_, rep) => (rep === beat.rep ? 'current' : 'pending'));
  for (let i = cursor; flows(plan.beats[i]); i--) {
    const b = plan.beats[i];
    if (!isJudgedHum(b)) continue;
    if (b.rep > beat.rep) break;
    const grade = grades.get(i);
    if (grade) stamps[b.rep] = grade;
    if (b.rep === 0) break;
  }
  return stamps;
}

// 直前の拍が判定する「んー」なら、その判定を返す(息を吸う間に見せる)。
export function previousGrade(plan: SessionPlan, cursor: number, grades: ReadonlyMap<number, Grade>): Grade | null {
  return isJudgedHum(plan.beats[cursor - 1]) ? (grades.get(cursor - 1) ?? null) : null;
}
