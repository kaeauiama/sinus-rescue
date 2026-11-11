import { CONTINUOUS_DEFAULT_HZ, CONTINUOUS_DEFAULT_MIN, DEFAULT_HUMS_PER_SET, DEFAULT_SETS_PER_TONE, HUM_REST_SEC } from '../rules';
import { noteName, snapToSemitone } from './dsp';
import { toneLabel } from './sites';
import type { Tone, VoiceProfile } from './tones';

export const KIND_SESSION = 'hum_session';
export const SETTING_SESSION = 'hum.session';
export const SETTING_PROGRESS = 'hum.progress';

export type Preset = 'short' | 'continuous';

// 鼻の出口の構え。つまむときは口を小さく開け、鼻と口の両方は閉じない(docs/01-hum-mechanics.md §9)。
export type Nose = 'open' | 'narrow' | 'pinch';

export interface SessionSettings {
  preset: Preset;
  programId?: string;
  humsPerSet: number;
  setsPerTone: number;
  restSec: number;
  continuousMin: number;
  order: string[];
  disabled: string[];
}

export const DEFAULT_SESSION: SessionSettings = {
  preset: 'short',
  humsPerSet: DEFAULT_HUMS_PER_SET,
  setsPerTone: DEFAULT_SETS_PER_TONE,
  restSec: HUM_REST_SEC,
  continuousMin: CONTINUOUS_DEFAULT_MIN,
  order: [],
  disabled: [],
};

export const sessionSettings = (stored: unknown): SessionSettings => ({
  ...DEFAULT_SESSION,
  ...(stored as Partial<SessionSettings> | undefined),
});

// toHz があるときは、1回のハミングの中で hz から toHz へ高さを滑らせる。
export interface PlanTone {
  toneId: string | null;
  label: string;
  hz: number;
  toHz?: number;
}

export type Beat =
  | { kind: 'breath'; toneIndex: number; rep: number; reps: number; ms: number; toneMs: number; nose: Nose; flush?: boolean }
  | { kind: 'hum'; toneIndex: number; rep: number; reps: number; ms: number; nose: Nose; flush?: boolean; part: number }
  // 滑らせるセットの頭で、帯の形をお手本の音と丸でなぞって見せる(D-039)。tones は見せる順の音、shapeMs は1つの長さ。
  | { kind: 'demo'; toneIndex: number; tones: number[]; leadMs: number; shapeMs: number; ms: number }
  | { kind: 'rest'; toneIndex: number; ms: number }
  | { kind: 'rate'; toneIndex: number; ms: number; nose: Nose; part: number };

export interface SessionPlan {
  preset: Preset;
  programId: string;
  name: string;
  tones: PlanTone[];
  beats: Beat[];
  signature: string;
}

// 並び順と無効化を反映した、今日ガイドする音。登録がなければ楽な高さの1音で始める。
export function planTones(settings: SessionSettings, tones: Tone[], profile: VoiceProfile | null): PlanTone[] {
  const rank = (id: string) => {
    const index = settings.order.indexOf(id);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  };
  const enabled = tones
    .filter((t) => !settings.disabled.includes(t.toneId))
    .sort((a, b) => rank(a.toneId) - rank(b.toneId))
    .map((t) => ({ toneId: t.toneId, label: toneLabel(t.site), hz: t.hz }));
  if (enabled.length) return enabled;
  if (profile) return [{ toneId: null, label: '楽な高さの音', hz: snapToSemitone(profile.comfortHz) }];
  return [{ toneId: null, label: '基本の音', hz: CONTINUOUS_DEFAULT_HZ }];
}

export function estimateSeconds(plan: SessionPlan): number {
  return plan.beats.reduce((sum, beat) => sum + beat.ms, 0) / 1000;
}

export function planSummary(plan: SessionPlan): string {
  const minutes = Math.max(1, Math.round(estimateSeconds(plan) / 60));
  if (plan.preset === 'continuous') return `連続型 約${minutes}分`;
  return `${plan.tones.length}音 約${minutes}分`;
}

// 再開時は、途中のハミングの手前(息を吸う拍か、お手本)まで戻す。
export function resumeCursor(plan: SessionPlan, cursor: number): number {
  let index = Math.max(0, Math.min(cursor, plan.beats.length - 1));
  while (index > 0 && plan.beats[index].kind !== 'breath' && plan.beats[index].kind !== 'demo') index--;
  return index;
}

export interface SessionProgress {
  day: string;
  signature: string;
  cursor: number;
  mode: 'tuner' | 'timer';
}

export function resumableProgress(progress: SessionProgress | undefined, plan: SessionPlan, today: string): SessionProgress | null {
  if (!progress || progress.day !== today || progress.signature !== plan.signature) return null;
  return progress.cursor > 0 && progress.cursor < plan.beats.length ? progress : null;
}

export type Drainage = 'none' | 'some' | 'clear';
export type NoseChange = 'better' | 'same' | 'worse';

export interface SessionToneResult {
  toneId: string | null;
  hz: number;
  hums: number;
  voicedSec: number;
  inTuneRatio: number | null;
}

// 構えくらべで、構えごとに体感の強さと、マイクで測った音量を残す。
export interface PostureResult {
  nose: Nose;
  rating: 1 | 2 | 3 | null;
  levelDb: number | null;
}

export interface SessionRecord {
  preset: Preset;
  programId?: string;
  programName?: string;
  mode: 'tuner' | 'timer';
  completed: boolean;
  durationSec: number;
  tones: SessionToneResult[];
  postures?: PostureResult[];
  placement?: 'air' | 'contact';
  drainage: Drainage | null;
  noseChange: NoseChange | null;
}

export const noteLabel = (hz: number) => `${noteName(hz)}  ${Math.round(hz)}Hz`;
