import { addDays, type LogEvent } from '../../../platform/events';
import { GRADUATE_DAYS, GRADUATE_MAX_GAP_DAYS, GRADUATE_MAX_SCORE } from '../rules';
import { decongestantUsedOn } from './streak';
import { overallScore, symptomOn } from './symptoms';
import { weeklyOn } from './weekly';

export interface GraduationProgress {
  days: number;
  target: number;
  reached: boolean;
}

// 軽い日の連続を数える。記録のない日は数えないが、短い抜けなら連続を切らない。
export function graduationProgress(events: LogEvent[], today: string, startedDay: string): GraduationProgress {
  let days = 0;
  let gap = 0;
  for (let day = today; day >= startedDay && days < GRADUATE_DAYS; day = addDays(day, -1)) {
    if (decongestantUsedOn(events, day)) break;
    const weekly = weeklyOn(events, day);
    if (weekly && weekly.change < 0) break;
    const score = overallScore(symptomOn(events, day));
    if (score == null) {
      if (day === today) continue;
      gap++;
      if (gap > GRADUATE_MAX_GAP_DAYS) break;
      continue;
    }
    if (score > GRADUATE_MAX_SCORE) break;
    gap = 0;
    days++;
  }
  return { days, target: GRADUATE_DAYS, reached: days >= GRADUATE_DAYS };
}
