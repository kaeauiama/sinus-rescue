import test from 'node:test';
import assert from 'node:assert/strict';
import {
  centsBetween,
  detectPitch,
  harmonicSeries,
  noteName,
  shuffled,
  summarizeTrack,
  targetsFromRange,
} from '../public/dsp.js';

const FRAME = 4096;

function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function hum(f0, sampleRate, { amplitudes = [1, 0.6, 0.4, 0.25, 0.15], noise = 0, vibratoCents = 0, seed = 1 } = {}) {
  const random = seededRandom(seed);
  const x = new Float32Array(FRAME);
  let phase = 0;
  for (let i = 0; i < FRAME; i++) {
    const t = i / sampleRate;
    const f = f0 * 2 ** ((vibratoCents * Math.sin(2 * Math.PI * 5 * t)) / 1200);
    phase += (2 * Math.PI * f) / sampleRate;
    let v = 0;
    amplitudes.forEach((a, h) => {
      v += a * Math.sin(phase * (h + 1));
    });
    x[i] = 0.1 * v + noise * (random() * 2 - 1);
  }
  return x;
}

const PITCHES = [70, 82.41, 98, 110, 130.81, 164.81, 196, 261.63, 329.63, 440, 523.25];

for (const sampleRate of [44100, 48000]) {
  test(`倍音を含むハミングを15セント以内で推定する (${sampleRate}Hz)`, () => {
    for (const f0 of PITCHES) {
      const { f0: found } = detectPitch(hum(f0, sampleRate), sampleRate);
      assert.ok(found, `${f0}Hz が無声と判定された`);
      assert.ok(Math.abs(centsBetween(found, f0)) < 15, `${f0}Hz → ${found.toFixed(2)}Hz`);
    }
  });

  test(`基本波が弱くても1オクターブ上にずれない (${sampleRate}Hz)`, () => {
    for (const f0 of PITCHES) {
      const signal = hum(f0, sampleRate, { amplitudes: [0.08, 1, 0.7, 0.5, 0.3] });
      const { f0: found } = detectPitch(signal, sampleRate);
      assert.ok(found, `${f0}Hz が無声と判定された`);
      assert.ok(Math.abs(centsBetween(found, f0)) < 25, `${f0}Hz → ${found.toFixed(2)}Hz`);
    }
  });

  test(`雑音が混ざっても推定できる (${sampleRate}Hz)`, () => {
    for (const f0 of PITCHES) {
      const { f0: found } = detectPitch(hum(f0, sampleRate, { noise: 0.02 }), sampleRate);
      assert.ok(found, `${f0}Hz が無声と判定された`);
      assert.ok(Math.abs(centsBetween(found, f0)) < 25, `${f0}Hz → ${found.toFixed(2)}Hz`);
    }
  });

  test(`揺れのある声でも中心の音程を捉える (${sampleRate}Hz)`, () => {
    const { f0: found } = detectPitch(hum(146.83, sampleRate, { vibratoCents: 20 }), sampleRate);
    assert.ok(Math.abs(centsBetween(found, 146.83)) < 40);
  });
}

test('無音は音程なしと判定する', () => {
  const { f0 } = detectPitch(new Float32Array(FRAME), 48000);
  assert.equal(f0, null);
});

test('白色雑音は音程なしと判定する', () => {
  const random = seededRandom(7);
  const x = Float32Array.from({ length: FRAME }, () => 0.1 * (random() * 2 - 1));
  assert.equal(detectPitch(x, 48000).f0, null);
});

test('1フレームの処理が50msの更新間隔より十分に短い', () => {
  const signal = hum(110, 48000);
  const started = performance.now();
  for (let i = 0; i < 100; i++) detectPitch(signal, 48000);
  const perFrame = (performance.now() - started) / 100;
  assert.ok(perFrame < 10, `${perFrame.toFixed(2)}ms`);
});

test('音名を返す', () => {
  assert.equal(noteName(440), 'A4');
  assert.equal(noteName(130.81), 'C3');
  assert.equal(noteName(98), 'G2');
});

test('声域から半音単位で音を選ぶ', () => {
  const targets = targetsFromRange(100, 250, 5);
  assert.equal(targets.length, 5);
  assert.ok(targets[0] >= 100 && targets.at(-1) <= 250);
  for (let i = 1; i < targets.length; i++) assert.ok(targets[i] > targets[i - 1]);
});

test('声域が狭すぎても重複した音を返さない', () => {
  const targets = targetsFromRange(200, 210, 5);
  assert.equal(new Set(targets).size, targets.length);
  assert.ok(targets.length >= 1);
});

test('summarizeTrack は安定区間とズレを集計する', () => {
  const points = [
    { t: 0, f0: 300, rms: 0.1 },
    { t: 500, f0: 200, rms: 0.1 },
    { t: 600, f0: 201, rms: 0.1 },
    { t: 700, f0: null, rms: 0.001 },
    { t: 800, f0: 199, rms: 0.1 },
  ];
  const s = summarizeTrack(points, { settleMs: 400, targetHz: 200 });
  assert.equal(s.frames, 4);
  assert.equal(s.voicedRatio, 0.75);
  assert.equal(s.medianHz, 200);
  assert.equal(s.octaveJumps, 0);
  assert.equal(s.centsOff, 0);
  assert.equal(s.inTuneRatio, 0.75);
});

test('summarizeTrack はオクターブの飛びを数える', () => {
  const points = [
    { t: 0, f0: 100, rms: 0.1 },
    { t: 50, f0: 200, rms: 0.1 },
    { t: 100, f0: 100, rms: 0.1 },
  ];
  assert.equal(summarizeTrack(points).octaveJumps, 2);
});

test('基準音の波形は純音と倍音で異なる', () => {
  assert.equal(harmonicSeries('sine').imag.length, 2);
  assert.ok(harmonicSeries('rich').imag.length > 5);
});

test('shuffled は要素を失わない', () => {
  const items = [1, 2, 3, 4, 5];
  assert.deepEqual(shuffled(items, seededRandom(3)).sort(), items);
});
