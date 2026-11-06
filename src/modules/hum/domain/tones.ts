import type { LogEvent } from '../../../platform/events';
import {
  COARSE_STEP_SEMITONES,
  COMFORT_TO_TOP_RATIO,
  FOREHEAD_TOP_RATIO,
  SWEEP_HIGH_LIMIT_HZ,
  SWEEP_LOW_LIMIT_HZ,
  SWEEP_MAX_NOTES,
} from '../rules';
import { centsBetween, hzToMidi, median, midiToHz, snapToSemitone, type CapturePoint } from './dsp';
import type { SiteId } from './sites';

export const KIND_PROFILE = 'hum_profile';
export const KIND_TONE = 'hum_tone';
export const KIND_TONE_REMOVED = 'hum_tone_removed';

export interface VoiceProfile {
  comfortHz: number;
  lowHz: number;
  falsettoHz: number | null;
}

export type Strength = 1 | 2 | 3;
export type Clearness = 'clear' | 'normal' | 'blocked' | null;

export interface ToneRecord {
  toneId: string;
  site: SiteId;
  hz: number;
  measuredHz: number | null;
  levelDb: number | null;
  strength: Strength;
  clearness: Clearness;
  method: 'self' | 'auto';
}

export interface Tone extends ToneRecord {
  registeredAt: string;
  history: { ts: string; hz: number; strength: Strength }[];
}

export function latestProfile(events: LogEvent[]): VoiceProfile | null {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].kind === KIND_PROFILE) return events[i].payload as VoiceProfile;
  }
  return null;
}

export function currentTones(events: LogEvent[]): Tone[] {
  const tones = new Map<string, Tone>();
  for (const event of events) {
    if (event.kind === KIND_TONE) {
      const record = event.payload as ToneRecord;
      const previous = tones.get(record.toneId);
      tones.set(record.toneId, {
        ...record,
        registeredAt: previous?.registeredAt ?? event.ts,
        history: [...(previous?.history ?? []), { ts: event.ts, hz: record.hz, strength: record.strength }],
      });
    } else if (event.kind === KIND_TONE_REMOVED) {
      tones.delete((event.payload as { toneId: string }).toneId);
    }
  }
  return [...tones.values()];
}

// 登録し直したときに表示する、前回との差。
export function semitoneDelta(previousHz: number, hz: number): number {
  return Math.round(centsBetween(hz, previousHz) / 100);
}

export function deltaText(semitones: number): string {
  if (semitones === 0) return '前回と同じ高さ';
  return `前回より半音${Math.abs(semitones)}つ${semitones > 0 ? '高い' : '低い'}`;
}

// おまかせ探索の範囲。額は裏声で響くことがあるので高い側まで広げる(暫定)。
export function sweepRange(profile: VoiceProfile, site: SiteId): [number, number] {
  const forehead = site === 'forehead';
  const low = forehead ? profile.comfortHz : profile.lowHz;
  const top = forehead
    ? (profile.falsettoHz ?? profile.comfortHz * FOREHEAD_TOP_RATIO)
    : profile.comfortHz * COMFORT_TO_TOP_RATIO;
  return [Math.max(SWEEP_LOW_LIMIT_HZ, low), Math.min(SWEEP_HIGH_LIMIT_HZ, top)];
}

export function sweepTargets(profile: VoiceProfile, site: SiteId): number[] {
  const [low, high] = sweepRange(profile, site);
  const start = Math.ceil(hzToMidi(low));
  const end = Math.floor(hzToMidi(high));
  const count = Math.floor((end - start) / COARSE_STEP_SEMITONES) + 1;
  const step = count > SWEEP_MAX_NOTES ? (end - start) / (SWEEP_MAX_NOTES - 1) : COARSE_STEP_SEMITONES;
  const notes = new Set<number>();
  for (let midi = start; midi <= end; midi += step) notes.add(Math.round(midi));
  if (!notes.size) notes.add(Math.round(hzToMidi(profile.comfortHz)));
  return [...notes].map(midiToHz);
}

export interface SweepTrial {
  targetHz: number;
  measuredHz: number | null;
  rating: 0 | 1 | 2;
  levelDb: number | null;
}

// 響いた試行を強い順に返す。評価は基準音ではなく実測の周波数に結びつける。
export function sweepCandidates(trials: SweepTrial[], limit = 3): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const ranked = trials
    .filter((t) => t.rating > 0 && t.measuredHz != null)
    .sort((a, b) => b.rating - a.rating);
  for (const trial of ranked) {
    const hz = snapToSemitone(trial.measuredHz as number);
    const key = Math.round(hzToMidi(hz));
    if (!seen.has(key)) {
      seen.add(key);
      out.push(hz);
    }
    if (out.length >= limit) break;
  }
  return out;
}

// 「ここ」を押した時点の、直前の安定した音程を返す。
export function stableF0(points: CapturePoint[], windowMs: number, minFrames: number): number | null {
  const last = points.at(-1);
  if (!last) return null;
  const recent = points.filter((p) => p.f0 != null && p.t >= last.t - windowMs).map((p) => p.f0 as number);
  return recent.length >= minFrames ? median(recent) : null;
}
