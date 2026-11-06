import {
  BREATH_SEC,
  BREATH_TONE_SEC,
  CONTINUOUS_BREATH_SEC,
  CONTINUOUS_DEFAULT_HZ,
  CONTINUOUS_DEFAULT_MIN,
  CONTINUOUS_HUMS_PER_MIN,
  DEFAULT_HUMS_PER_SET,
  DEFAULT_SETS_PER_TONE,
  HUM_HOLD_SEC,
  HUM_REST_SEC,
} from '../rules';
import { noteName, snapToSemitone } from './dsp';
import { toneLabel } from './sites';
import type { Tone, VoiceProfile } from './tones';

export const KIND_SESSION = 'hum_session';
export const SETTING_SESSION = 'hum.session';
export const SETTING_PROGRESS = 'hum.progress';

export type Preset = 'short' | 'continuous';

export interface SessionSettings {
  preset: Preset;
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

export interface PlanTone {
  toneId: string | null;
  label: string;
  hz: number;
}

export type Beat =
  | { kind: 'breath'; toneIndex: number; rep: number; reps: number; ms: number; toneMs: number }
  | { kind: 'hum'; toneIndex: number; rep: number; reps: number; ms: number }
  | { kind: 'rest'; toneIndex: number; ms: number };

export interface SessionPlan {
  preset: Preset;
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

export function buildPlan(settings: SessionSettings, tones: PlanTone[]): SessionPlan {
  const beats: Beat[] = [];
  let planned = tones;
  if (settings.preset === 'continuous') {
    planned = tones.slice(0, 1);
    const reps = Math.max(1, Math.round(settings.continuousMin * CONTINUOUS_HUMS_PER_MIN));
    const humMs = Math.round((60_000 / CONTINUOUS_HUMS_PER_MIN) - CONTINUOUS_BREATH_SEC * 1000);
    for (let rep = 0; rep < reps; rep++) {
      beats.push({
        kind: 'breath',
        toneIndex: 0,
        rep,
        reps,
        ms: CONTINUOUS_BREATH_SEC * 1000,
        toneMs: rep === 0 ? CONTINUOUS_BREATH_SEC * 1000 : 0,
      });
      beats.push({ kind: 'hum', toneIndex: 0, rep, reps, ms: humMs });
    }
  } else {
    const reps = Math.max(1, settings.humsPerSet);
    const sets = Math.max(1, settings.setsPerTone);
    planned.forEach((_, toneIndex) => {
      for (let set = 0; set < sets; set++) {
        for (let rep = 0; rep < reps; rep++) {
          // 吸いながら基準音を聞き、音が止まったら同じ高さでハミングする。目を閉じていても続けられる。
          beats.push({
            kind: 'breath',
            toneIndex,
            rep,
            reps,
            ms: BREATH_SEC * 1000,
            toneMs: BREATH_TONE_SEC * 1000,
          });
          beats.push({ kind: 'hum', toneIndex, rep, reps, ms: HUM_HOLD_SEC * 1000 });
        }
        const last = toneIndex === planned.length - 1 && set === sets - 1;
        if (!last && settings.restSec > 0) beats.push({ kind: 'rest', toneIndex, ms: settings.restSec * 1000 });
      }
    });
  }
  const signature = JSON.stringify([settings.preset, settings.humsPerSet, settings.setsPerTone, settings.restSec, settings.continuousMin, planned.map((t) => Math.round(t.hz))]);
  return { preset: settings.preset, tones: planned, beats, signature };
}

export function estimateSeconds(plan: SessionPlan): number {
  return plan.beats.reduce((sum, beat) => sum + beat.ms, 0) / 1000;
}

export function planSummary(plan: SessionPlan): string {
  const minutes = Math.max(1, Math.round(estimateSeconds(plan) / 60));
  if (plan.preset === 'continuous') return `連続型 約${minutes}分`;
  return `${plan.tones.length}音 約${minutes}分`;
}

// 再開時は、途中のハミングの手前(息を吸う拍)まで戻す。
export function resumeCursor(plan: SessionPlan, cursor: number): number {
  let index = Math.max(0, Math.min(cursor, plan.beats.length - 1));
  while (index > 0 && plan.beats[index].kind !== 'breath') index--;
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

export interface SessionRecord {
  preset: Preset;
  mode: 'tuner' | 'timer';
  completed: boolean;
  durationSec: number;
  tones: SessionToneResult[];
  drainage: Drainage | null;
  noseChange: NoseChange | null;
}

export const noteLabel = (hz: number) => `${noteName(hz)}  ${Math.round(hz)}Hz`;
