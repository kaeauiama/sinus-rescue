import { createEvent } from '../../../platform/events';
import { SWEEP_MAX_NOTES } from '../rules';
import { hzToMidi } from './dsp';
import { toneLabel } from './sites';
import {
  currentTones,
  deltaText,
  KIND_PROFILE,
  KIND_TONE,
  KIND_TONE_REMOVED,
  latestProfile,
  semitoneDelta,
  stableF0,
  sweepCandidates,
  sweepRange,
  sweepTargets,
  type ToneRecord,
  type VoiceProfile,
} from './tones';

const PROFILE: VoiceProfile = { comfortHz: 140, lowHz: 98, falsettoHz: null };

const record = (partial: Partial<ToneRecord>): ToneRecord => ({
  toneId: 'a',
  site: 'cheek',
  hz: 130.81,
  measuredHz: 131,
  levelDb: -45,
  strength: 2,
  clearness: null,
  method: 'self',
  ...partial,
});

describe('currentTones', () => {
  it('登録し直すと最新の値になり、履歴が残る', () => {
    const events = [
      createEvent(KIND_TONE, record({ hz: 130.81 })),
      createEvent(KIND_TONE, record({ hz: 146.83, strength: 3 })),
    ];
    const [tone] = currentTones(events);
    expect(tone.hz).toBe(146.83);
    expect(tone.history.map((h) => h.hz)).toEqual([130.81, 146.83]);
  });

  it('同じ部位に複数の音を登録できる', () => {
    const events = [createEvent(KIND_TONE, record({ toneId: 'a' })), createEvent(KIND_TONE, record({ toneId: 'b', hz: 196 }))];
    expect(currentTones(events)).toHaveLength(2);
  });

  it('削除した音は一覧から消えるが、記録自体は残る', () => {
    const events = [createEvent(KIND_TONE, record({})), createEvent(KIND_TONE_REMOVED, { toneId: 'a' })];
    expect(currentTones(events)).toHaveLength(0);
    expect(events).toHaveLength(2);
  });
});

it('最新の声の高さを返す', () => {
  expect(latestProfile([])).toBeNull();
  const events = [createEvent(KIND_PROFILE, PROFILE), createEvent(KIND_PROFILE, { ...PROFILE, comfortHz: 150 })];
  expect(latestProfile(events)?.comfortHz).toBe(150);
});

describe('おまかせ探索の範囲', () => {
  it('通常は低い音から楽な高さの1オクターブ上まで', () => {
    expect(sweepRange(PROFILE, 'cheek')).toEqual([98, 280]);
  });

  it('額は裏声の領域まで広げる', () => {
    expect(sweepRange(PROFILE, 'forehead')).toEqual([140, 350]);
    expect(sweepRange({ ...PROFILE, falsettoHz: 440 }, 'forehead')).toEqual([140, 440]);
  });

  it('音は半音の格子に乗り、範囲に収まり、数に上限がある', () => {
    const targets = sweepTargets(PROFILE, 'cheek');
    expect(targets.length).toBeGreaterThan(5);
    expect(targets.length).toBeLessThanOrEqual(SWEEP_MAX_NOTES);
    for (const hz of targets) {
      expect(hzToMidi(hz) % 1).toBeCloseTo(0, 5);
      expect(hz).toBeGreaterThanOrEqual(98);
      expect(hz).toBeLessThanOrEqual(280);
    }
  });

  it('広い声域でも音数の上限を超えない', () => {
    const wide = sweepTargets({ comfortHz: 200, lowHz: 70, falsettoHz: null }, 'cheek');
    expect(wide.length).toBeLessThanOrEqual(SWEEP_MAX_NOTES);
  });

  it('声域が狭くても少なくとも1音を返す', () => {
    expect(sweepTargets({ comfortHz: 140, lowHz: 140, falsettoHz: 140 }, 'forehead').length).toBeGreaterThan(0);
  });
});

describe('sweepCandidates', () => {
  it('評価は基準音でなく実測の周波数に結びつける(M0 のオクターブずれ)', () => {
    const [best] = sweepCandidates([{ targetHz: 261.6, measuredHz: 130.8, rating: 2, levelDb: -43 }]);
    expect(best).toBeCloseTo(130.81, 1);
  });

  it('強い順に並べ、重複を除き、響かなかった試行は含めない', () => {
    const candidates = sweepCandidates([
      { targetHz: 100, measuredHz: 100, rating: 0, levelDb: -45 },
      { targetHz: 130, measuredHz: 131, rating: 1, levelDb: -45 },
      { targetHz: 196, measuredHz: 196, rating: 2, levelDb: -45 },
      { targetHz: 196, measuredHz: 197, rating: 2, levelDb: -45 },
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toBeCloseTo(196, 0);
  });

  it('響いた音がなければ空を返す', () => {
    expect(sweepCandidates([{ targetHz: 100, measuredHz: 100, rating: 0, levelDb: -45 }])).toEqual([]);
  });
});

describe('stableF0', () => {
  const frames = (values: (number | null)[]) => values.map((f0, i) => ({ t: i * 100, f0, rms: 0.01 }));

  it('直前の安定した音程を返す', () => {
    expect(stableF0(frames([100, 100, 200, 200, 200, 200, 200, 200]), 500, 3)).toBe(200);
  });

  it('声が足りなければ null を返す', () => {
    expect(stableF0(frames([200, null, null, null, null, null]), 500, 3)).toBeNull();
    expect(stableF0([], 500, 3)).toBeNull();
  });
});

it('前回との差を言葉にする', () => {
  expect(semitoneDelta(130.81, 146.83)).toBe(2);
  expect(deltaText(2)).toBe('前回より半音2つ高い');
  expect(deltaText(-1)).toBe('前回より半音1つ低い');
  expect(deltaText(0)).toBe('前回と同じ高さ');
});

it('登録名は体感の言葉にする', () => {
  expect(toneLabel('forehead')).toBe('額が響く音');
});
