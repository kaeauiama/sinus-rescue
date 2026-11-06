import {
  PITCH_F_MAX,
  PITCH_F_MIN,
  PITCH_MAX_APERIODICITY,
  PITCH_MIN_DB,
  PITCH_THRESHOLD,
} from '../rules';

export interface PitchResult {
  f0: number | null;
  clarity: number;
  rms: number;
}

export interface CapturePoint {
  t: number;
  f0: number | null;
  rms: number;
}

export function rms(x: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return x.length ? Math.sqrt(sum / x.length) : 0;
}

export const toDb = (v: number) => (v > 0 ? 20 * Math.log10(v) : -120);
export const fromDb = (db: number) => 10 ** (db / 20);

function decimate(x: ArrayLike<number>, factor: number): Float32Array {
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) sum += x[i * factor + j];
    out[i] = sum / factor;
    mean += out[i];
  }
  mean /= n || 1;
  for (let i = 0; i < n; i++) out[i] -= mean;
  return out;
}

// YIN 法。低い声を扱うので、計算量を抑えるため 16kHz 付近まで間引いてから処理する。
export function detectPitch(samples: ArrayLike<number>, sampleRate: number): PitchResult {
  const level = rms(samples);
  if (level < fromDb(PITCH_MIN_DB)) return { f0: null, clarity: 0, rms: level };

  const factor = Math.max(1, Math.floor(sampleRate / 16000));
  const x = decimate(samples, factor);
  const sr = sampleRate / factor;
  const tauMin = Math.max(2, Math.floor(sr / PITCH_F_MAX));
  const tauMax = Math.min(Math.ceil(sr / PITCH_F_MIN), Math.floor(x.length / 2));
  const width = x.length - tauMax;
  if (tauMax <= tauMin + 1 || width <= 0) return { f0: null, clarity: 0, rms: level };

  const cmnd = new Float32Array(tauMax + 1);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < width; i++) {
      const delta = x[i] - x[i + tau];
      sum += delta * delta;
    }
    running += sum;
    cmnd[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  let best = -1;
  for (let tau = tauMin; tau < tauMax; tau++) {
    if (cmnd[tau] < PITCH_THRESHOLD) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    best = tauMin;
    for (let tau = tauMin + 1; tau < tauMax; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    if (cmnd[best] > PITCH_MAX_APERIODICITY) return { f0: null, clarity: 1 - cmnd[best], rms: level };
  }

  const a = cmnd[best - 1];
  const b = cmnd[best];
  const c = cmnd[best + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-1, Math.min(1, (0.5 * (a - c)) / denom)) : 0;
  return { f0: sr / (best + shift), clarity: 1 - b, rms: level };
}

export const centsBetween = (f: number, ref: number) => 1200 * Math.log2(f / ref);
export const hzToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
export const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
export const snapToSemitone = (f: number) => midiToHz(Math.round(hzToMidi(f)));

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(f: number): string {
  const midi = Math.round(hzToMidi(f));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((p, q) => p - q);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface TrackSummary {
  frames: number;
  voicedRatio: number;
  voicedSec: number;
  medianHz: number | null;
  spreadCents: number | null;
  levelDb: number | null;
  centsOff: number | null;
  inTuneRatio: number;
}

interface SummaryOptions {
  settleMs?: number;
  targetHz?: number | null;
  toleranceCents?: number;
  frameMs?: number;
}

export function summarizeTrack(
  points: CapturePoint[],
  { settleMs = 0, targetHz = null, toleranceCents = 50, frameMs = 50 }: SummaryOptions = {},
): TrackSummary {
  const usable = points.filter((p) => p.t >= settleMs);
  const voiced = usable.filter((p): p is CapturePoint & { f0: number } => p.f0 != null);
  const medianHz = median(voiced.map((p) => p.f0));
  const inTune = targetHz
    ? voiced.filter((p) => Math.abs(centsBetween(p.f0, targetHz)) <= toleranceCents).length
    : 0;
  return {
    frames: usable.length,
    voicedRatio: usable.length ? voiced.length / usable.length : 0,
    voicedSec: (voiced.length * frameMs) / 1000,
    medianHz,
    spreadCents: medianHz ? median(voiced.map((p) => Math.abs(centsBetween(p.f0, medianHz)))) : null,
    levelDb: median(voiced.map((p) => toDb(p.rms))),
    centsOff: medianHz && targetHz ? centsBetween(medianHz, targetHz) : null,
    inTuneRatio: usable.length ? inTune / usable.length : 0,
  };
}

// 小さなスピーカーでも音程がわかるよう、基本波より第2〜第5倍音を厚くする(M0 で確認済み)。
const RICH_AMPLITUDES = [0.8, 1, 0.9, 0.7, 0.5, 0.35, 0.25, 0.16, 0.1, 0.06];

export function richHarmonics(): { real: Float32Array; imag: Float32Array } {
  const real = new Float32Array(RICH_AMPLITUDES.length + 1);
  const imag = new Float32Array(RICH_AMPLITUDES.length + 1);
  RICH_AMPLITUDES.forEach((a, i) => {
    imag[i + 1] = a;
  });
  return { real, imag };
}
