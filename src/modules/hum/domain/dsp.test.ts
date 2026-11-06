import { centsBetween, detectPitch, fromDb, noteName, richHarmonics, snapToSemitone, summarizeTrack, type CapturePoint } from './dsp';

const FRAME = 4096;
const PITCHES = [70, 82.41, 98, 110, 130.81, 164.81, 196, 261.63, 329.63, 440, 523.25];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

interface HumOptions {
  amplitudes?: number[];
  noise?: number;
  vibratoCents?: number;
  gain?: number;
}

function hum(f0: number, sampleRate: number, { amplitudes = [1, 0.6, 0.4, 0.25, 0.15], noise = 0, vibratoCents = 0, gain = 0.1 }: HumOptions = {}) {
  const random = seededRandom(1);
  const x = new Float32Array(FRAME);
  let phase = 0;
  for (let i = 0; i < FRAME; i++) {
    const f = f0 * 2 ** ((vibratoCents * Math.sin((2 * Math.PI * 5 * i) / sampleRate)) / 1200);
    phase += (2 * Math.PI * f) / sampleRate;
    let v = 0;
    amplitudes.forEach((a, h) => {
      v += a * Math.sin(phase * (h + 1));
    });
    x[i] = gain * v + noise * (random() * 2 - 1);
  }
  return x;
}

describe.each([44100, 48000])('detectPitch (%iHz)', (sampleRate) => {
  it('倍音を含むハミングを15セント以内で推定する', () => {
    for (const f0 of PITCHES) {
      const { f0: found } = detectPitch(hum(f0, sampleRate), sampleRate);
      expect(Math.abs(centsBetween(found as number, f0))).toBeLessThan(15);
    }
  });

  it('基本波が弱くても1オクターブ上にずれない', () => {
    for (const f0 of PITCHES) {
      const { f0: found } = detectPitch(hum(f0, sampleRate, { amplitudes: [0.08, 1, 0.7, 0.5, 0.3] }), sampleRate);
      expect(Math.abs(centsBetween(found as number, f0))).toBeLessThan(25);
    }
  });

  it('雑音が混ざっても推定できる', () => {
    for (const f0 of PITCHES) {
      const { f0: found } = detectPitch(hum(f0, sampleRate, { noise: 0.02 }), sampleRate);
      expect(Math.abs(centsBetween(found as number, f0))).toBeLessThan(25);
    }
  });
});

describe('音量の下限(M0 の実機結果に基づく PITCH_MIN_DB)', () => {
  const amplitudes = [1];
  const sineAt = (db: number) => hum(98, 48000, { amplitudes, gain: fromDb(db) * Math.SQRT2 });

  it('M0 で最も低かった -52dB のハミングを検出する', () => {
    expect(detectPitch(sineAt(-52), 48000).f0).not.toBeNull();
  });

  it('-62dB の雑音は音程なしと判定する', () => {
    const random = seededRandom(5);
    const amplitude = fromDb(-62) * Math.sqrt(3);
    const x = Float32Array.from({ length: FRAME }, () => amplitude * (random() * 2 - 1));
    expect(detectPitch(x, 48000).f0).toBeNull();
  });

  it('下限を超える白色雑音も周期性の判定で除外する', () => {
    const random = seededRandom(7);
    const x = Float32Array.from({ length: FRAME }, () => 0.1 * (random() * 2 - 1));
    expect(detectPitch(x, 48000).f0).toBeNull();
  });

  it('無音は音程なしと判定する', () => {
    expect(detectPitch(new Float32Array(FRAME), 48000).f0).toBeNull();
  });
});

describe('summarizeTrack', () => {
  const points: CapturePoint[] = [
    { t: 0, f0: 300, rms: 0.1 },
    { t: 500, f0: 200, rms: 0.1 },
    { t: 600, f0: 201, rms: 0.1 },
    { t: 700, f0: null, rms: 0.001 },
    { t: 800, f0: 199, rms: 0.1 },
  ];

  it('安定区間だけを集計し、基準音とのズレを返す', () => {
    const summary = summarizeTrack(points, { settleMs: 400, targetHz: 200 });
    expect(summary.frames).toBe(4);
    expect(summary.voicedRatio).toBe(0.75);
    expect(summary.medianHz).toBe(200);
    expect(summary.centsOff).toBe(0);
    expect(summary.inTuneRatio).toBe(0.75);
  });

  it('音量は声が出ている区間だけで集計する', () => {
    expect(summarizeTrack(points, { settleMs: 400 }).levelDb).toBeCloseTo(-20, 5);
  });
});

it('音名と半音への丸めを返す', () => {
  expect(noteName(440)).toBe('A4');
  expect(noteName(130.81)).toBe('C3');
  expect(noteName(98)).toBe('G2');
  expect(snapToSemitone(333)).toBeCloseTo(329.63, 1);
});

it('基準音は基本波より第2倍音を厚くする', () => {
  const { imag } = richHarmonics();
  expect(imag[2]).toBeGreaterThan(imag[1]);
});
