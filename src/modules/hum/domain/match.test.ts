import type { TrackSummary } from './dsp';
import { classifyCents, classifyMatch, matchHint } from './match';

const summary = (partial: Partial<TrackSummary>): TrackSummary => ({
  frames: 100,
  voicedRatio: 1,
  voicedSec: 5,
  medianHz: 200,
  spreadCents: 5,
  levelDb: -45,
  centsOff: 0,
  inTuneRatio: 1,
  ...partial,
});

describe('classifyCents', () => {
  it('許容幅の中は合っていると判定する', () => {
    expect(classifyCents(22)).toBe('in-tune');
    expect(classifyCents(-50)).toBe('in-tune');
  });

  it('M0 で起きた1オクターブ下の合わせ方を区別する', () => {
    expect(classifyCents(-1200)).toBe('octave-low');
    expect(classifyCents(1190)).toBe('octave-high');
  });

  it('それ以外のズレは off とする', () => {
    expect(classifyCents(300)).toBe('off');
    expect(classifyCents(-900)).toBe('off');
  });
});

describe('classifyMatch', () => {
  it('声が足りないときは silent とする', () => {
    expect(classifyMatch(summary({ voicedRatio: 0.1 }))).toBe('silent');
    expect(classifyMatch(summary({ centsOff: null }))).toBe('silent');
  });

  it('1オクターブ下を検出する', () => {
    expect(classifyMatch(summary({ centsOff: -1200 }))).toBe('octave-low');
  });
});

it('ズレに応じた短い案内を返す', () => {
  expect(matchHint(0)).toBe('そのまま');
  expect(matchHint(-100)).toBe('もう少し高く');
  expect(matchHint(100)).toBe('もう少し低く');
  expect(matchHint(-1200)).toBe('1オクターブ低いです');
});
