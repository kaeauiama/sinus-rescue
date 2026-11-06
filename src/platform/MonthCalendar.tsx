import type { ComponentChildren } from 'preact';
import { addMonths, monthGrid, monthLabel, monthOf } from './calendar';
import { longDayLabel, WEEKDAYS } from './events';
import { Icon } from './icons';

export interface DayMark {
  level: 'full' | 'part' | null;
  dot?: boolean;
  label?: string;
}

interface MonthCalendarProps {
  month: string;
  today: string;
  selected: string;
  minMonth: string;
  mark: (day: string) => DayMark;
  onMonth: (month: string) => void;
  onSelect: (day: string) => void;
  children?: ComponentChildren;
}

// 月ごとの印を並べる。印の意味は色だけに頼らず、凡例と読み上げの文で伝える。
export function MonthCalendar({ month, today, selected, minMonth, mark, onMonth, onSelect, children }: MonthCalendarProps) {
  const weeks = monthGrid(month);
  return (
    <div class="calendar">
      <div class="calendar-head">
        <button type="button" class="icon-button" aria-label="前の月" disabled={month <= minMonth} onClick={() => onMonth(addMonths(month, -1))}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <strong>{monthLabel(month)}</strong>
        <button type="button" class="icon-button" aria-label="次の月" disabled={month >= monthOf(today)} onClick={() => onMonth(addMonths(month, 1))}>
          <Icon name="chevronRight" size={20} />
        </button>
      </div>
      <table class="calendar-grid">
        <thead>
          <tr>
            {WEEKDAYS.map((weekday, index) => (
              <th key={weekday} scope="col" class={index === 0 ? 'sun' : index === 6 ? 'sat' : ''}>
                {weekday}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, index) => (
            <tr key={index}>
              {week.map((day, column) =>
                day ? (
                  <td key={day}>
                    <DayCell day={day} today={today} selected={selected} mark={mark(day)} onSelect={onSelect} />
                  </td>
                ) : (
                  <td key={`blank-${column}`} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {children}
    </div>
  );
}

function DayCell({ day, today, selected, mark, onSelect }: { day: string; today: string; selected: string; mark: DayMark; onSelect: (day: string) => void }) {
  const classes = ['cal-day', mark.level ? `cal-${mark.level}` : '', day === today ? 'cal-today' : '', day === selected ? 'cal-selected' : ''];
  return (
    <button
      type="button"
      class={classes.join(' ')}
      aria-label={[longDayLabel(day), day === today ? '今日' : '', mark.label ?? ''].filter(Boolean).join(' ')}
      aria-pressed={day === selected}
      disabled={day > today}
      onClick={() => onSelect(day)}
    >
      <span>{Number(day.slice(8))}</span>
      {mark.dot && <i class="cal-dot" aria-hidden="true" />}
    </button>
  );
}
