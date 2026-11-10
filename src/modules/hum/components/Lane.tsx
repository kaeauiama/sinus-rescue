// 流れる帯(D-038)。縦が声の高さ、横が時間。帯は右から流れてきて、縦線の位置が今。左には自分の声の跡が残る。
import { useEffect, useRef } from 'preact/hooks';
import { hzToMidi } from '../domain/dsp';
import { bandCents, bandHz, type Grade, type LaneSegment, type Stamp } from '../domain/lane';
import type { PlanTone } from '../domain/session';
import { LANE_HISTORY_SEC, LANE_PREVIEW_SEC } from '../rules';

// 声の跡の1点。at は performance.now() の時刻(検出の遅れを引いたもの)、midi は帯に重ねたあとの高さ。
export interface TracePoint {
  at: number;
  midi: number;
  inside: boolean;
}

// 拍をまたいで持ち越す状態。拍ごとに画面が作り直されても、声の跡と縦の範囲が途切れないようにする。
export interface LaneState {
  trace: TracePoint[];
  live: TracePoint | null;
  view: { low: number; high: number } | null;
  drawnAt: number;
}

export const createLaneState = (): LaneState => ({ trace: [], live: null, view: null, drawnAt: 0 });

export interface LaneBoardProps {
  segments: LaneSegment[];
  startedAt: number;
  state: LaneState;
  stamps: Stamp[];
  judge: Grade | null;
}

// 見た目だけの値で、判定には関わらない。
const MIN_SPAN = 10; // 縦に見せる最小の幅(半音)
const MARGIN = 2; // 帯の上下に空ける幅(半音)
const VIEW_EASE_MS = 300;
const LIVE_MS = 250;
const STEP_MS = 50;
const TRACE_GAP_MS = 120;
const LABEL_MIN_PX = 36;
const LABELS = 3;

const nextFrame = (draw: () => void): number =>
  typeof requestAnimationFrame === 'function' ? requestAnimationFrame(draw) : window.setTimeout(draw, 16);
const cancelFrame = (id: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : clearTimeout(id));
const fixed = (v: number) => v.toFixed(1);

type HumSegment = LaneSegment & { tone: PlanTone };

// 見えている帯が収まるよう、縦の範囲を少しずつ動かす。
function updateView(state: LaneState, hums: HumSegment[], clock: number) {
  if (hums.length) {
    let low = Infinity;
    let high = -Infinity;
    for (const { tone } of hums) {
      const half = bandCents(tone) / 100;
      for (const hz of [tone.hz, tone.toHz ?? tone.hz]) {
        low = Math.min(low, hzToMidi(hz) - half);
        high = Math.max(high, hzToMidi(hz) + half);
      }
    }
    const span = Math.max(MIN_SPAN, high - low + 2 * MARGIN);
    const mid = (low + high) / 2;
    const target = { low: mid - span / 2, high: mid + span / 2 };
    if (!state.view) state.view = target;
    else {
      const k = 1 - Math.exp(-Math.max(0, clock - state.drawnAt) / VIEW_EASE_MS);
      state.view.low += (target.low - state.view.low) * k;
      state.view.high += (target.high - state.view.high) * k;
    }
  }
  state.drawnAt = clock;
}

function bandPath(s: HumSegment, from: number, to: number, x: (ms: number) => number, y: (midi: number) => number): string {
  const times = [from];
  if (s.tone.toHz) for (let ms = Math.ceil(from / STEP_MS) * STEP_MS; ms < to; ms += STEP_MS) if (ms > from) times.push(ms);
  times.push(to);
  const half = bandCents(s.tone) / 100;
  const mids = times.map((ms) => hzToMidi(bandHz(s.tone, ms - s.start, s.end - s.start)));
  const top = times.map((ms, i) => `${fixed(x(ms))} ${fixed(y(mids[i] + half))}`);
  const bottom = times.map((ms, i) => `${fixed(x(ms))} ${fixed(y(mids[i] - half))}`).reverse();
  return `M${top.join('L')}L${bottom.join('L')}Z`;
}

function Lane({ segments, startedAt, state }: Pick<LaneBoardProps, 'segments' | 'startedAt' | 'state'>) {
  const svg = useRef<SVGSVGElement>(null);
  const grid = useRef<SVGPathElement>(null);
  const bands = useRef<SVGPathElement>(null);
  const outside = useRef<SVGPathElement>(null);
  const inside = useRef<SVGPathElement>(null);
  const now = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const labels = useRef<(SVGTextElement | null)[]>([]);

  useEffect(() => {
    const paint = () => {
      const el = svg.current;
      if (!el || !grid.current || !bands.current || !outside.current || !inside.current || !now.current || !dot.current) return;
      const box = el.getBoundingClientRect();
      const w = box.width || 320;
      const h = box.height || 232;
      el.setAttribute('viewBox', `0 0 ${fixed(w)} ${fixed(h)}`);
      const clock = performance.now();
      const t = clock - startedAt;
      const past = LANE_HISTORY_SEC * 1000;
      const future = LANE_PREVIEW_SEC * 1000;
      const scale = w / (past + future);
      const xNow = past * scale;
      const x = (ms: number) => xNow + (ms - t) * scale;
      const visible = segments.filter((s) => s.end > t - past && s.start < t + future);
      const hums = visible.filter((s): s is HumSegment => s.tone != null);
      updateView(state, hums, clock);
      const view = state.view;
      if (!view) return;
      const y = (midi: number) => h - ((midi - view.low) / (view.high - view.low)) * h;
      const clampedY = (midi: number) => y(Math.max(view.low, Math.min(view.high, midi)));

      let d = '';
      for (let m = Math.ceil(view.low); m <= view.high; m++) d += `M0 ${fixed(y(m))}H${fixed(w)}`;
      grid.current.setAttribute('d', d);

      bands.current.setAttribute(
        'd',
        hums.map((s) => bandPath(s, Math.max(s.start, t - past), Math.min(s.end, t + future), x, y)).join(''),
      );

      const breaths = visible.filter((s) => s.tone == null);
      labels.current.forEach((label, i) => {
        if (!label) return;
        const s = breaths[i];
        const from = s ? Math.max(x(s.start), 0) : 0;
        const to = s ? Math.min(x(s.end), w) : 0;
        if (!s || to - from < LABEL_MIN_PX) {
          label.setAttribute('visibility', 'hidden');
          return;
        }
        label.setAttribute('visibility', 'visible');
        label.setAttribute('x', fixed((from + to) / 2));
        label.setAttribute('y', fixed(h / 2));
      });

      state.trace = state.trace.filter((p) => p.at >= clock - past - TRACE_GAP_MS);
      let ins = '';
      let outs = '';
      for (let i = 1; i < state.trace.length; i++) {
        const p = state.trace[i - 1];
        const q = state.trace[i];
        if (q.at - p.at > TRACE_GAP_MS) continue;
        const line = `M${fixed(xNow + (p.at - clock) * scale)} ${fixed(clampedY(p.midi))}L${fixed(xNow + (q.at - clock) * scale)} ${fixed(clampedY(q.midi))}`;
        if (q.inside) ins += line;
        else outs += line;
      }
      inside.current.setAttribute('d', ins);
      outside.current.setAttribute('d', outs);

      now.current.setAttribute('x1', fixed(xNow));
      now.current.setAttribute('x2', fixed(xNow));
      now.current.setAttribute('y2', fixed(h));

      const live = state.live;
      const shown = live != null && clock - live.at < LIVE_MS;
      dot.current.classList.toggle('visible', shown);
      if (live && shown) {
        dot.current.setAttribute('cx', fixed(xNow));
        dot.current.setAttribute('cy', fixed(clampedY(live.midi)));
        dot.current.classList.toggle('inside', live.inside);
      }
    };
    let frame = 0;
    const loop = () => {
      paint();
      frame = nextFrame(loop);
    };
    loop();
    return () => cancelFrame(frame);
  }, [segments, startedAt, state]);

  return (
    <svg class="lane" ref={svg} aria-hidden="true">
      <path class="lane-grid" ref={grid} />
      <path class="lane-band" ref={bands} />
      {Array.from({ length: LABELS }, (_, i) => (
        <text
          key={i}
          class="lane-label"
          visibility="hidden"
          ref={(el) => {
            labels.current[i] = el;
          }}
        >
          吸う
        </text>
      ))}
      <line class="lane-now" ref={now} y1="0" />
      <path class="lane-trace" ref={outside} />
      <path class="lane-trace inside" ref={inside} />
      <circle class="lane-dot" ref={dot} r="8" />
    </svg>
  );
}

// 帯と、今のセットの結果の丸、直前の回の判定をまとめて置く。
export function LaneBoard({ segments, startedAt, state, stamps, judge }: LaneBoardProps) {
  return (
    <div class="lane-board">
      {stamps.length > 0 && (
        <ol class="stamps" aria-hidden="true">
          {stamps.map((stamp, i) => (
            <li key={i} class={`stamp ${stamp.toLowerCase()}`} />
          ))}
        </ol>
      )}
      <div class="lane-wrap">
        <Lane segments={segments} startedAt={startedAt} state={state} />
        <p class={`judge ${judge ? judge.toLowerCase() : ''}`} aria-live="polite">
          {judge ?? ''}
        </p>
      </div>
    </div>
  );
}
