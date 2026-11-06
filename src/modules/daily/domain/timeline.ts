import { addDays, latestOn, type LogEvent } from '../../../platform/events';
import { KIND_MORNING, type MorningRecord } from '../../hum/domain/history';
import { medActiveOn, medList, type Med } from './meds';
import { humSessionOn, type RoutineItem } from './routine';
import { isDayComplete, streakTargets } from './streak';
import { overallScore, symptomOn, tagsOn, type SymptomRecord } from './symptoms';

export const KIND_SLEEP = 'sleep';

export interface SleepRecord {
  satisfaction: number;
  hours: number | null;
}

export interface TimelineDay {
  day: string;
  overall: number | null;
  symptoms: SymptomRecord | null;
  careComplete: boolean | null;
  hum: boolean;
  morning: number | null;
  sleep: SleepRecord | null;
  tags: string[];
  meds: Med[];
  visit: boolean;
}

// 古い日から順に並べる。記録のない日は null のまま残し、線でつながない。
export function timelineDays(events: LogEvent[], items: RoutineItem[], today: string, count: number): TimelineDay[] {
  const meds = medList(events);
  const visits = new Set(events.filter((e) => e.kind === 'visit').map((e) => (e.payload as { date: string }).date));
  const hasTargets = streakTargets(items).length > 0;
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(today, i - count + 1);
    const symptoms = symptomOn(events, day);
    return {
      day,
      overall: overallScore(symptoms),
      symptoms,
      careComplete: hasTargets ? isDayComplete(items, events, day) : null,
      hum: humSessionOn(events, day),
      morning: latestOn<MorningRecord>(events, KIND_MORNING, day)?.score ?? null,
      sleep: latestOn<SleepRecord>(events, KIND_SLEEP, day),
      tags: tagsOn(events, day),
      meds: meds.filter((med) => medActiveOn(med, day)),
      visit: visits.has(day),
    };
  });
}
