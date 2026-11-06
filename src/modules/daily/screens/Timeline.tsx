import { useState } from 'preact/hooks';
import { dayLabel, logicalDay, longDayLabel } from '../../../platform/events';
import { SETTING_HIDE_CHART, useDaily } from '../context';
import { SIDE_LABELS, SYMPTOMS, type SymptomId } from '../domain/symptoms';
import { timelineDays, type TimelineDay } from '../domain/timeline';
import { TIMELINE_DAYS } from '../rules';

interface View {
  id: string;
  label: string;
  series: { name: string; value: (day: TimelineDay) => number | null; className: string }[];
}

const scoreOf = (id: SymptomId) => (day: TimelineDay) => day.symptoms?.scores[id] ?? null;

// 嗅覚が落ちると嫌なにおいも感じにくくなるので、この2つは必ず並べて見せる。
const VIEWS: View[] = [
  { id: 'overall', label: '総合', series: [{ name: '総合', value: (day) => day.overall, className: 'series-1' }] },
  { id: 'congestion', label: '鼻づまり', series: [{ name: '鼻づまり', value: scoreOf('congestion'), className: 'series-1' }] },
  { id: 'drip', label: '後鼻漏', series: [{ name: '後鼻漏の不快感', value: scoreOf('drip'), className: 'series-1' }] },
  {
    id: 'smell',
    label: '嗅覚とにおい',
    series: [
      { name: '嗅覚の低下', value: scoreOf('smellLoss'), className: 'series-1' },
      { name: '嫌なにおい', value: scoreOf('odor'), className: 'series-2' },
    ],
  },
  { id: 'heaviness', label: '顔・頭', series: [{ name: '顔・頭の重さ', value: scoreOf('heaviness'), className: 'series-1' }] },
  { id: 'stress', label: 'ストレス', series: [{ name: 'ストレス', value: scoreOf('stress'), className: 'series-1' }] },
];

const WIDTH = 320;
const LEFT = 48;
const RIGHT = 6;
const TOP = 8;
const PLOT_BOTTOM = 158;
const AXIS_LABEL_Y = 174;
const ROW_START = 192;
const ROW_STEP = 18;
const GRID = [0, 3, 7, 10];

function Chart({ days, view, selected, onSelect }: { days: TimelineDay[]; view: View; selected: number; onSelect: (index: number) => void }) {
  const step = (WIDTH - LEFT - RIGHT) / (days.length - 1);
  const x = (index: number) => LEFT + index * step;
  const y = (value: number) => TOP + ((10 - value) * (PLOT_BOTTOM - TOP)) / 10;
  const rows: { label: string; mark: (day: TimelineDay) => boolean; hollow?: (day: TimelineDay) => boolean }[] = [
    { label: 'ケア', mark: (day) => day.careComplete !== null, hollow: (day) => day.careComplete === false },
    { label: 'ハミング', mark: (day) => day.hum },
    { label: 'タグ', mark: (day) => day.tags.length > 0 },
    { label: '薬', mark: (day) => day.meds.length > 0 },
  ];
  const height = ROW_START + rows.length * ROW_STEP;

  const pick = (event: PointerEvent) => {
    const svg = event.currentTarget as SVGSVGElement;
    const box = svg.getBoundingClientRect();
    const position = ((event.clientX - box.left) / box.width) * WIDTH;
    onSelect(Math.max(0, Math.min(days.length - 1, Math.round((position - LEFT) / step))));
  };

  return (
    <svg
      class="chart"
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={`${view.label}の${days.length}日間の推移`}
      onPointerDown={pick}
      onPointerMove={(event) => {
        if (event.buttons) pick(event);
      }}
    >
      {GRID.map((value) => (
        <g key={value}>
          <line class="chart-grid" x1={LEFT} x2={WIDTH - RIGHT} y1={y(value)} y2={y(value)} />
          <text class="chart-text" x={LEFT - 8} y={y(value) + 4} text-anchor="end">
            {value}
          </text>
        </g>
      ))}
      {[0, Math.floor((days.length - 1) / 2), days.length - 1].map((index) => (
        <text key={index} class="chart-text" x={x(index)} y={AXIS_LABEL_Y} text-anchor={index === days.length - 1 ? 'end' : index === 0 ? 'start' : 'middle'}>
          {dayLabel(days[index].day).split(' ')[0]}
        </text>
      ))}
      <line class="chart-cursor" x1={x(selected)} x2={x(selected)} y1={TOP} y2={height - 4} />
      {view.series.map((series) => {
        const paths: string[] = [];
        const dots: { i: number; value: number }[] = [];
        let open = false;
        days.forEach((day, i) => {
          const value = series.value(day);
          if (value == null) {
            open = false;
            return;
          }
          paths.push(`${open ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`);
          const neighbors = [days[i - 1], days[i + 1]].some((d) => d && series.value(d) != null);
          if (!neighbors) dots.push({ i, value });
          open = true;
        });
        const point = series.value(days[selected]);
        return (
          <g key={series.name} class={series.className}>
            <path class="chart-line" d={paths.join(' ')} />
            {dots.map((dot) => (
              <circle key={dot.i} class="chart-dot" cx={x(dot.i)} cy={y(dot.value)} r={2.5} />
            ))}
            {point != null && <circle class="chart-point" cx={x(selected)} cy={y(point)} r={4.5} />}
          </g>
        );
      })}
      {rows.map((row, rowIndex) => {
        const rowY = ROW_START + rowIndex * ROW_STEP;
        return (
          <g key={row.label}>
            <text class="chart-text" x={0} y={rowY + 4}>
              {row.label}
            </text>
            {days.map((day, i) =>
              row.mark(day) ? (
                <rect
                  key={day.day}
                  class={row.hollow?.(day) ? 'chart-mark hollow' : 'chart-mark'}
                  x={x(i) - 3}
                  y={rowY - 3}
                  width={6}
                  height={6}
                  rx={1.5}
                />
              ) : null,
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function DayDetail({ day }: { day: TimelineDay }) {
  const scores = SYMPTOMS.flatMap((symptom) => {
    const score = day.symptoms?.scores[symptom.id];
    if (score == null) return [];
    const side = day.symptoms?.sides[symptom.id];
    return [{ id: symptom.id, label: symptom.label, text: side ? `${score}（${SIDE_LABELS[side]}）` : String(score) }];
  });
  const rows = [
    ...scores,
    ...(day.morning != null ? [{ id: 'morning', label: '朝の鼻の通り', text: String(day.morning) }] : []),
    ...(day.sleep ? [{ id: 'sleep', label: '眠り', text: `${day.sleep.satisfaction}${day.sleep.hours ? `（${day.sleep.hours}時間）` : ''}` }] : []),
    ...(day.tags.length ? [{ id: 'tags', label: 'タグ', text: day.tags.join('、') }] : []),
    ...(day.meds.length ? [{ id: 'meds', label: '薬', text: day.meds.map((m) => m.label).join('、') }] : []),
    ...(day.visit ? [{ id: 'visit', label: '受診', text: 'あり' }] : []),
  ];
  return (
    <section class="card day-card">
      <h2>{longDayLabel(day.day)}</h2>
      {rows.length === 0 && <p class="note">この日の記録はありません。</p>}
      <dl class="result days">
        {rows.map((row) => (
          <div key={row.id}>
            <dt>{row.label}</dt>
            <dd>{row.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Legend({ view }: { view: View }) {
  if (view.series.length < 2) return null;
  return (
    <ul class="legend">
      {view.series.map((series) => (
        <li key={series.name} class={series.className}>
          <span class="legend-mark" aria-hidden="true" />
          {series.name}
        </li>
      ))}
    </ul>
  );
}

// 経過のグラフ。カレンダーのタブの中で切り替えて見る。
export function TimelinePanel() {
  const { events, items, settings } = useDaily();
  const today = logicalDay(new Date());
  const days = timelineDays(events, items, today, TIMELINE_DAYS);
  const [selected, setSelected] = useState(days.length - 1);
  const [viewId, setViewId] = useState(VIEWS[0].id);
  const view = VIEWS.find((v) => v.id === viewId) ?? VIEWS[0];
  const hidden = Boolean(settings[SETTING_HIDE_CHART]);

  return (
    <>
      {hidden ? (
        <p class="note">グラフは隠しています。設定から戻せます。</p>
      ) : (
        <>
          <div class="chips scroll-chips">
            {VIEWS.map((option) => (
              <button
                type="button"
                key={option.id}
                class={`chip ${option.id === viewId ? 'chip-active' : ''}`}
                aria-pressed={option.id === viewId}
                onClick={() => setViewId(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div class="card chart-card">
            <h2 class="card-title">{`${view.label}　直近${days.length}日`}</h2>
            <Legend view={view} />
            <Chart days={days} view={view} selected={selected} onSelect={setSelected} />
          </div>
          <DayDetail day={days[selected]} />
        </>
      )}
      <details class="table-view">
        <summary>{`${days.length}日分を表で見る`}</summary>
        <dl class="result days">
          {[...days].reverse().map((day) => (
            <div key={day.day} class={day.overall == null && !day.careComplete ? 'empty' : ''}>
              <dt>{dayLabel(day.day)}</dt>
              <dd>
                {hidden ? '' : `総合 ${day.overall ?? '－'}　`}
                {day.careComplete ? 'ケア済' : 'ケア－'}
                {day.tags.length ? `　${day.tags.join('、')}` : ''}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </>
  );
}
