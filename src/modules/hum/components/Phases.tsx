import { useEffect, useRef } from 'preact/hooks';
import { Screen } from '../../../platform/ui';
import { useHum, useLatest } from '../context';
import { scaled } from '../debug';
import {
  centsBetween,
  detectPitch,
  noteName,
  summarizeTrack,
  type CapturePoint,
  type TrackSummary,
} from '../domain/dsp';
import { classifyCents, matchHint } from '../domain/match';
import { FRAME_INTERVAL_MS, PITCH_TOLERANCE_CENTS, SETTLE_MS, TONE_GAP_MS } from '../rules';

const DOT_RANGE_CENTS = 200;

// 一定間隔で音程を読み取る。
export function useFrames(active: boolean, onFrame: (point: CapturePoint) => void): void {
  const { engine } = useHum();
  const latest = useLatest(onFrame);
  useEffect(() => {
    if (!active) return undefined;
    const started = performance.now();
    const timer = setInterval(() => {
      const pitch = detectPitch(engine.readFrame(), engine.sampleRate);
      latest.current({ t: performance.now() - started, f0: pitch.f0, rms: pitch.rms });
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, engine]);
}

export function useCountdown(ms: number, onDone: () => void): { current: HTMLSpanElement | null } {
  const bar = useRef<HTMLSpanElement>(null);
  const latest = useLatest(onDone);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => {
      const fraction = (performance.now() - started) / ms;
      if (bar.current) bar.current.style.width = `${Math.min(100, fraction * 100)}%`;
      if (fraction >= 1) {
        clearInterval(timer);
        latest.current();
      }
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ms]);
  return bar;
}

interface ListenProps {
  hz: number;
  ms: number;
  progress?: number;
  caption?: string;
  onClose?: () => void;
  onDone: () => void;
}

export function ListenPhase({ hz, ms, progress, caption, onClose, onDone }: ListenProps) {
  const { engine } = useHum();
  const latest = useLatest(onDone);
  useEffect(() => {
    const stop = engine.playTone(hz, scaled(ms));
    const timer = setTimeout(() => latest.current(), scaled(ms) + TONE_GAP_MS);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [engine, hz, ms]);
  return (
    <Screen centered progress={progress} onClose={onClose} title="聞いてください" note={caption} />
  );
}

interface HumProps {
  targetHz: number;
  ms: number;
  title?: string;
  caption?: string;
  cue?: string;
  toHz?: number;
  progress?: number;
  onClose?: () => void;
  closeLabel?: string;
  onDone: (summary: TrackSummary) => void;
}

// toHz があるときは、目標の高さが時間とともに toHz へ動く(スロープ)。
export function HumPhase({ targetHz, toHz, ms, title = '同じ高さで「んー」', caption, cue, progress, onClose, closeLabel, onDone }: HumProps) {
  const { engine } = useHum();
  const dot = useRef<HTMLSpanElement>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const points = useRef<CapturePoint[]>([]);
  const glideInTune = useRef(0);
  const duration = scaled(ms);
  const targetAt = (t: number) => (toHz ? targetHz * (toHz / targetHz) ** Math.min(1, t / duration) : targetHz);

  useEffect(() => {
    engine.simulateHum(targetHz);
    return () => engine.simulateHum(null);
  }, [engine, targetHz]);

  useFrames(true, (point) => {
    points.current.push(point);
    const target = targetAt(point.t);
    if (toHz) engine.simulateHum(target);
    if (toHz && point.f0 != null && Math.abs(centsBetween(point.f0, target)) <= PITCH_TOLERANCE_CENTS) glideInTune.current += 1;
    if (!dot.current || !hint.current) return;
    if (point.f0 == null) {
      dot.current.classList.remove('visible');
      return;
    }
    const cents = centsBetween(point.f0, target);
    const clamped = Math.max(-DOT_RANGE_CENTS, Math.min(DOT_RANGE_CENTS, cents));
    dot.current.classList.add('visible');
    dot.current.classList.toggle('in-tune', classifyCents(cents) === 'in-tune');
    dot.current.style.left = `${50 + (clamped / DOT_RANGE_CENTS) * 50}%`;
    hint.current.textContent = matchHint(cents);
  });

  const bar = useCountdown(duration, () => {
    const settleMs = Math.min(scaled(SETTLE_MS), duration / 2);
    const summary = summarizeTrack(points.current, {
      settleMs,
      targetHz: toHz ? null : targetHz,
      toleranceCents: PITCH_TOLERANCE_CENTS,
      frameMs: FRAME_INTERVAL_MS,
    });
    if (toHz) summary.inTuneRatio = summary.frames ? glideInTune.current / points.current.length : 0;
    onDone(summary);
  });

  return (
    <Screen centered progress={progress} onClose={onClose} closeLabel={closeLabel} title={title} note={caption}>
      {cue && <p class="cue">{cue}</p>}
      <div class="tuner" aria-hidden="true">
        <span class="tuner-line" />
        <span class="tuner-center" />
        <span class="tuner-dot" ref={dot} />
      </div>
      <p class="note center" ref={hint} aria-live="polite">
        &nbsp;
      </p>
      <div class="timebar">
        <span ref={bar} />
      </div>
    </Screen>
  );
}

interface LiveHzProps {
  onFrame?: (point: CapturePoint) => void;
}

// 声の高さをそのまま大きく表示する。
export function LiveHz({ onFrame }: LiveHzProps) {
  const hz = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLParagraphElement>(null);
  useFrames(true, (point) => {
    onFrame?.(point);
    if (point.f0 == null) return;
    if (hz.current) hz.current.textContent = point.f0.toFixed(0);
    if (name.current) name.current.textContent = noteName(point.f0);
  });
  return (
    <>
      <div class="hz">
        <span ref={hz}>--</span>
        <small>Hz</small>
      </div>
      <p class="note center" ref={name}>
        &nbsp;
      </p>
    </>
  );
}
