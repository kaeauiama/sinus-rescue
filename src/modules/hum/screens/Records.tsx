import { useState } from 'preact/hooks';
import { monthOf } from '../../../platform/calendar';
import { MonthCalendar, type DayMark } from '../../../platform/MonthCalendar';
import { logicalDay, longDayLabel, type LogEvent } from '../../../platform/events';
import { Screen } from '../../../platform/ui';
import { useHum } from '../context';
import { countedSessionOn, dayRows } from '../domain/history';
import { KIND_SESSION } from '../domain/session';
import { RECORD_DAYS } from '../rules';

function markOf(events: LogEvent[], day: string): DayMark {
  const [row] = dayRows(events, day, 1);
  const counted = countedSessionOn(events, day);
  const level = counted ? 'full' : row.sessions ? 'part' : null;
  const labels = [counted ? 'ハミングあり' : row.sessions ? '1分未満のハミング' : '', row.morning != null ? `朝の鼻の通り ${row.morning}` : ''];
  return { level, dot: row.morning != null, label: labels.filter(Boolean).join(' ') };
}

// ハミングだけで使うときのカレンダー。1分以上続けた日に印を付ける。
export function Records() {
  const { events, nav } = useHum();
  const today = logicalDay(new Date());
  const [selected, setSelected] = useState(today);
  const [month, setMonth] = useState(monthOf(today));
  const firstDay = events.reduce((min, e) => (e.day < min ? e.day : min), today);
  const recent = dayRows(events, today, RECORD_DAYS).filter((row) => row.sessions > 0).length;
  const inMonth = new Set(
    events.filter((e) => e.kind === KIND_SESSION && monthOf(e.day) === month && countedSessionOn(events, e.day)).map((e) => e.day),
  ).size;
  const [row] = dayRows(events, selected, 1);

  return (
    <Screen align="top" footer={nav}>
      <header class="page-head">
        <h1>カレンダー</h1>
      </header>
      <div class="stats">
        <div class="stat">
          <span class="stat-label">{`直近${RECORD_DAYS}日`}</span>
          <strong>{recent}</strong>
          <span class="stat-unit">日</span>
        </div>
        <div class="stat">
          <span class="stat-label">この月</span>
          <strong>{inMonth}</strong>
          <span class="stat-unit">日</span>
        </div>
      </div>
      <div class="card">
        <MonthCalendar
          month={month}
          today={today}
          selected={selected}
          minMonth={monthOf(firstDay)}
          mark={(day) => markOf(events, day)}
          onMonth={setMonth}
          onSelect={setSelected}
        >
          <ul class="cal-legend">
            <li>
              <i class="lg-full" aria-hidden="true" />
              1分以上
            </li>
            <li>
              <i class="lg-part" aria-hidden="true" />
              1分未満
            </li>
            <li>
              <i class="lg-dot" aria-hidden="true" />
              朝の記録
            </li>
          </ul>
        </MonthCalendar>
      </div>
      <section class="card day-card">
        <h2>{longDayLabel(selected)}</h2>
        <dl class="result">
          <div>
            <dt>ハミング</dt>
            <dd>{row.sessions ? (row.minutes ? `${row.minutes}分` : '1分未満') : '－'}</dd>
          </div>
          <div>
            <dt>朝の鼻の通り</dt>
            <dd>{row.morning ?? '－'}</dd>
          </div>
        </dl>
      </section>
    </Screen>
  );
}
