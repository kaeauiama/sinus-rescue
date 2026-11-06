import { useState } from 'preact/hooks';
import { monthGrid, monthOf } from '../../../platform/calendar';
import { MonthCalendar, type DayMark } from '../../../platform/MonthCalendar';
import { dayDiff, logicalDay, type LogEvent } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import { checksOn, isDone, type RoutineItem } from '../domain/routine';
import { symptomOn } from '../domain/symptoms';
import { timelineDays } from '../domain/timeline';
import { BACKFILL_MAX_DAYS } from '../rules';
import { DayDetail, TimelinePanel } from './Timeline';

type Mode = 'month' | 'graph';

function markOf(events: LogEvent[], items: RoutineItem[], day: string): DayMark {
  const [record] = timelineDays(events, items, day, 1);
  const checks = checksOn(events, day);
  const some = items.some((item) => isDone(item, checks, events, day));
  const level = record.careComplete ? 'full' : some ? 'part' : null;
  const labels = [level === 'full' ? 'ケア完了' : level === 'part' ? 'ケア一部' : '', record.symptoms ? '症状の記録あり' : ''];
  return { level, dot: record.symptoms != null, label: labels.filter(Boolean).join(' ') };
}

export function Calendar({ day }: { day?: string }) {
  const { events, items, startedDay, nav, go } = useDaily();
  const today = logicalDay(new Date());
  const [mode, setMode] = useState<Mode>('month');
  const [selected, setSelected] = useState(day ?? today);
  const [month, setMonth] = useState(monthOf(day ?? today));
  const firstDay = events.reduce((min, e) => (e.day < min ? e.day : min), startedDay < today ? startedDay : today);
  const [record] = timelineDays(events, items, selected, 1);
  const editable = dayDiff(selected, today) <= BACKFILL_MAX_DAYS;

  const monthDays = monthGrid(month)
    .flat()
    .filter((d): d is string => d != null && d <= today);
  const careDays = monthDays.filter((d) => timelineDays(events, items, d, 1)[0].careComplete === true).length;
  const symptomDays = monthDays.filter((d) => symptomOn(events, d) != null).length;

  return (
    <Screen align="top" footer={nav}>
      <header class="page-head">
        <h1>カレンダー</h1>
      </header>
      <div class="segmented" role="group" aria-label="表示">
        <button type="button" class={mode === 'month' ? 'segment-active' : ''} aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
          カレンダー
        </button>
        <button type="button" class={mode === 'graph' ? 'segment-active' : ''} aria-pressed={mode === 'graph'} onClick={() => setMode('graph')}>
          グラフ
        </button>
      </div>

      {mode === 'graph' ? (
        <TimelinePanel />
      ) : (
        <>
          <div class="stats">
            <div class="stat">
              <span class="stat-label">ケア完了</span>
              <strong>{careDays}</strong>
              <span class="stat-unit">日</span>
            </div>
            <div class="stat">
              <span class="stat-label">症状の記録</span>
              <strong>{symptomDays}</strong>
              <span class="stat-unit">日</span>
            </div>
          </div>
          <div class="card">
            <MonthCalendar
              month={month}
              today={today}
              selected={selected}
              minMonth={monthOf(firstDay)}
              mark={(d) => markOf(events, items, d)}
              onMonth={setMonth}
              onSelect={setSelected}
            >
              <ul class="cal-legend">
                <li>
                  <i class="lg-full" aria-hidden="true" />
                  ケア完了
                </li>
                <li>
                  <i class="lg-part" aria-hidden="true" />
                  一部
                </li>
                <li>
                  <i class="lg-dot" aria-hidden="true" />
                  症状の記録
                </li>
              </ul>
            </MonthCalendar>
          </div>
          <DayDetail day={record} />
          {editable && (
            <div class="inline-actions">
              <Btn onClick={() => go({ name: 'today', day: selected === today ? undefined : selected })}>
                {selected === today ? '今日の記録を開く' : 'この日の記録を開く'}
              </Btn>
            </div>
          )}
        </>
      )}
    </Screen>
  );
}
