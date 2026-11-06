import { addDays, dayDiff, dayLabel, type LogEvent } from '../../../platform/events';
import { RATE_DAYS, SUMMARY_WEEKS } from '../rules';
import { medList, MED_TYPES, visitList } from './meds';
import { checksOn, RINSE_RETURNS, type RinseReturn, type RoutineItem } from './routine';
import { completionRate } from './streak';
import { overallScore, SIDE_LABELS, symptomOn, SYMPTOMS, tagsOn, type Side } from './symptoms';
import { weeklyChanges } from './weekly';

export interface SummarySection {
  title: string;
  lines: string[];
}

const average = (values: number[]) =>
  values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;

function weekDays(today: string, weeksAgo: number): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, -i - weeksAgo * 7));
}

const formatScore = (value: number | null) => (value == null ? '記録なし' : String(value));

// 受診時に経過を伝えるための要約。記録の集計だけを載せ、原因や効果の判断は書かない(HC-1, HC-7)。
export function visitSummary(events: LogEvent[], items: RoutineItem[], today: string, startedDay: string): SummarySection[] {
  const sections: SummarySection[] = [];
  const recordedDays = new Set(events.filter((e) => e.kind === 'symptom').map((e) => e.day));

  sections.push({
    title: '期間',
    lines: [`${dayLabel(startedDay)} から ${dayLabel(today)}(${dayDiff(startedDay, today) + 1}日、症状の記録は${recordedDays.size}日)`],
  });

  const weeks: string[] = [];
  for (let w = SUMMARY_WEEKS - 1; w >= 0; w--) {
    const days = weekDays(today, w);
    if (days[0] < startedDay) continue;
    const mean = average(days.map((day) => overallScore(symptomOn(events, day))).filter((v): v is number => v != null));
    weeks.push(`${dayLabel(days[6] < startedDay ? startedDay : days[6])}〜 ${formatScore(mean)}`);
  }
  sections.push({ title: '総合スコアの週平均(0〜10、高いほど悪い)', lines: weeks.length ? weeks : ['1週間分の記録がありません'] });

  const lines = SYMPTOMS.map((symptom) => {
    const mean = (w: number) =>
      average(
        weekDays(today, w)
          .map((day) => symptomOn(events, day)?.scores[symptom.id])
          .filter((v): v is number => v != null),
      );
    return `${symptom.label}: 直近7日 ${formatScore(mean(0))} / その前の7日 ${formatScore(mean(1))}`;
  });
  sections.push({ title: '項目別の平均', lines });

  const sideCounts = new Map<string, number>();
  for (let day = today; day >= startedDay; day = addDays(day, -1)) {
    for (const [id, side] of Object.entries(symptomOn(events, day)?.sides ?? {})) {
      sideCounts.set(`${id}:${side}`, (sideCounts.get(`${id}:${side}`) ?? 0) + 1);
    }
  }
  const sideLines = SYMPTOMS.filter((s) => s.sided).flatMap((symptom) => {
    const counts = (['left', 'right', 'both'] as Side[])
      .map((side) => [side, sideCounts.get(`${symptom.id}:${side}`) ?? 0] as const)
      .filter(([, count]) => count > 0)
      .map(([side, count]) => `${SIDE_LABELS[side]} ${count}日`);
    return counts.length ? [`${symptom.label}: ${counts.join('、')}`] : [];
  });
  if (sideLines.length) sections.push({ title: '左右', lines: sideLines });

  const meds = medList(events).map((med) => {
    const type = MED_TYPES.find((t) => t.id === med.medType)?.label;
    const name = type && type !== med.label ? `${med.label}(${type})` : med.label;
    return `${name} ${dayLabel(med.start)} 〜 ${med.end ? dayLabel(med.end) : '使用中'}`;
  });
  if (meds.length) sections.push({ title: '薬', lines: meds });

  const visits = visitList(events).map((v) => `${dayLabel(v.date)}${v.memo ? ` ${v.memo}` : ''}`);
  if (visits.length) sections.push({ title: '受診', lines: visits });

  const care: string[] = [];
  const rate = completionRate(items, events, today, startedDay);
  if (rate != null) care.push(`直近${RATE_DAYS}日の実施率 ${Math.round(rate * 100)}%`);
  const returns = new Map<RinseReturn, number>();
  for (let day = today; day >= startedDay; day = addDays(day, -1)) {
    for (const record of checksOn(events, day).values()) {
      if (record.rinseReturn) returns.set(record.rinseReturn, (returns.get(record.rinseReturn) ?? 0) + 1);
    }
  }
  const returnText = RINSE_RETURNS.filter((r) => returns.has(r.id)).map((r) => `${r.label} ${returns.get(r.id)}回`);
  if (returnText.length) care.push(`洗浄液の戻り: ${returnText.join('、')}`);
  if (care.length) sections.push({ title: 'ケア', lines: care });

  const tagCounts = new Map<string, number>();
  for (let day = today; day >= startedDay; day = addDays(day, -1)) {
    for (const tag of tagsOn(events, day)) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  if (tagCounts.size) {
    sections.push({ title: 'タグ', lines: [[...tagCounts].map(([tag, count]) => `${tag} ${count}日`).join('、')] });
  }

  const changes = weeklyChanges(events, today, SUMMARY_WEEKS * 7);
  if (changes.length) {
    const text = changes.map((c) => `${dayLabel(c.day)} ${c.change > 0 ? '+' : ''}${c.change}`).join('、');
    sections.push({ title: '先週と比べた変化(−3〜+3)', lines: [text] });
  }

  return sections;
}

export function summaryText(title: string, sections: SummarySection[]): string {
  const body = sections.map((s) => `【${s.title}】\n${s.lines.join('\n')}`).join('\n\n');
  return `${title}\n本人による記録の集計です。\n\n${body}\n`;
}
