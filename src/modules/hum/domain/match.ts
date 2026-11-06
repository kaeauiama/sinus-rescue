import { OCTAVE_TOLERANCE_CENTS, PITCH_TOLERANCE_CENTS } from '../rules';
import type { TrackSummary } from './dsp';

export type MatchKind = 'in-tune' | 'off' | 'octave-low' | 'octave-high' | 'silent';

const MIN_VOICED_RATIO = 0.3;

export function classifyCents(cents: number): Exclude<MatchKind, 'silent'> {
  const abs = Math.abs(cents);
  if (abs <= PITCH_TOLERANCE_CENTS) return 'in-tune';
  if (Math.abs(abs - 1200) <= OCTAVE_TOLERANCE_CENTS) return cents < 0 ? 'octave-low' : 'octave-high';
  return 'off';
}

export function classifyMatch(summary: TrackSummary): MatchKind {
  if (summary.centsOff == null || summary.voicedRatio < MIN_VOICED_RATIO) return 'silent';
  return classifyCents(summary.centsOff);
}

export function matchHint(cents: number): string {
  const kind = classifyCents(cents);
  if (kind === 'in-tune') return 'そのまま';
  if (kind === 'octave-low') return '1オクターブ低いです';
  if (kind === 'octave-high') return '1オクターブ高いです';
  return cents < 0 ? 'もう少し高く' : 'もう少し低く';
}
