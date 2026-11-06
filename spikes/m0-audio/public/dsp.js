// 音程推定と音階の計算。DOM と Web Audio に依存しない純粋関数だけを置く。

export const PITCH_DEFAULTS = {
  fMin: 65,
  fMax: 650,
  threshold: 0.15,
  maxAperiodicity: 0.35,
  minRms: 0.002,
};

export function rms(x) {
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i] * x[i];
  return x.length ? Math.sqrt(sum / x.length) : 0;
}

export const toDb = (v) => (v > 0 ? 20 * Math.log10(v) : -120);

function decimate(x, factor) {
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
export function detectPitch(samples, sampleRate, options = {}) {
  const { fMin, fMax, threshold, maxAperiodicity, minRms } = { ...PITCH_DEFAULTS, ...options };
  const level = rms(samples);
  if (level < minRms) return { f0: null, clarity: 0, rms: level };

  const factor = Math.max(1, Math.floor(sampleRate / 16000));
  const x = decimate(samples, factor);
  const sr = sampleRate / factor;
  const tauMin = Math.max(2, Math.floor(sr / fMax));
  const tauMax = Math.min(Math.ceil(sr / fMin), Math.floor(x.length / 2));
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
    if (cmnd[tau] < threshold) {
      while (tau + 1 < tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      best = tau;
      break;
    }
  }
  if (best < 0) {
    best = tauMin;
    for (let tau = tauMin + 1; tau < tauMax; tau++) if (cmnd[tau] < cmnd[best]) best = tau;
    if (cmnd[best] > maxAperiodicity) return { f0: null, clarity: 1 - cmnd[best], rms: level };
  }

  const a = cmnd[best - 1];
  const b = cmnd[best];
  const c = cmnd[best + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? Math.max(-1, Math.min(1, (0.5 * (a - c)) / denom)) : 0;
  return { f0: sr / (best + shift), clarity: 1 - b, rms: level };
}

export const centsBetween = (f, ref) => 1200 * Math.log2(f / ref);
export const hzToMidi = (f) => 69 + 12 * Math.log2(f / 440);
export const midiToHz = (m) => 440 * 2 ** ((m - 69) / 12);

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function noteName(f) {
  const midi = Math.round(hzToMidi(f));
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((p, q) => p - q);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// points: [{ t: ミリ秒, f0: Hz | null, rms }]
export function summarizeTrack(points, { settleMs = 0, targetHz = null, toleranceCents = 50 } = {}) {
  const usable = points.filter((p) => p.t >= settleMs);
  const voiced = usable.filter((p) => p.f0);
  const medianHz = median(voiced.map((p) => p.f0));
  let octaveJumps = 0;
  for (let i = 1; i < voiced.length; i++) {
    if (Math.abs(centsBetween(voiced[i].f0, voiced[i - 1].f0)) > 600) octaveJumps++;
  }
  const summary = {
    frames: usable.length,
    voicedRatio: usable.length ? voiced.length / usable.length : 0,
    medianHz,
    spreadCents: medianHz ? median(voiced.map((p) => Math.abs(centsBetween(p.f0, medianHz)))) : null,
    octaveJumps,
    levelDb: median(usable.map((p) => toDb(p.rms))),
  };
  if (targetHz) {
    const inTune = voiced.filter((p) => Math.abs(centsBetween(p.f0, targetHz)) <= toleranceCents);
    summary.centsOff = medianHz ? centsBetween(medianHz, targetHz) : null;
    summary.inTuneRatio = usable.length ? inTune.length / usable.length : 0;
  }
  return summary;
}

// 声域の中から、半音単位でなるべく等間隔に音を選ぶ。
export function targetsFromRange(lowHz, highHz, count) {
  const low = Math.ceil(hzToMidi(Math.min(lowHz, highHz)));
  const high = Math.floor(hzToMidi(Math.max(lowHz, highHz)));
  if (high <= low) return [midiToHz(low)];
  const notes = new Set();
  for (let i = 0; i < count; i++) notes.add(Math.round(low + ((high - low) * i) / Math.max(1, count - 1)));
  return [...notes].map(midiToHz);
}

export function shuffled(items, random = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// 小さなスピーカーでも音程がわかるよう、基本波より第2〜第5倍音を厚くする。
const RICH_AMPLITUDES = [0.8, 1, 0.9, 0.7, 0.5, 0.35, 0.25, 0.16, 0.1, 0.06];

export function harmonicSeries(kind) {
  const amplitudes = kind === 'sine' ? [1] : RICH_AMPLITUDES;
  const real = new Float32Array(amplitudes.length + 1);
  const imag = new Float32Array(amplitudes.length + 1);
  amplitudes.forEach((a, i) => {
    imag[i + 1] = a;
  });
  return { real, imag };
}
