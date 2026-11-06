import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { logicalDay } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import { HumPhase, useCountdown } from '../components/Phases';
import { useHum, useLatest, useWakeLock } from '../context';
import { scaled } from '../debug';
import type { TrackSummary } from '../domain/dsp';
import {
  buildPlan,
  DEFAULT_SESSION,
  KIND_SESSION,
  planTones,
  resumeCursor,
  SETTING_PROGRESS,
  SETTING_SESSION,
  type Beat,
  type Drainage,
  type NoseChange,
  type SessionProgress,
  type SessionRecord,
  type SessionSettings,
  type SessionToneResult,
} from '../domain/session';
import { tonesForToday } from '../domain/experiment';
import { currentTones, latestProfile } from '../domain/tones';

interface BeatProps<B extends Beat> {
  beat: B;
  caption: string;
  progress: number;
  onClose: () => void;
  onDone: () => void;
}

function Breath({ beat, caption, hz, progress, withTone, onClose, onDone }: BeatProps<Extract<Beat, { kind: 'breath' }>> & { hz: number; withTone: boolean }) {
  const { engine } = useHum();
  useEffect(() => {
    if (!withTone || beat.toneMs <= 0) return undefined;
    return engine.playTone(hz, scaled(beat.toneMs));
  }, [engine, hz, beat, withTone]);
  const bar = useCountdown(scaled(beat.ms), onDone);
  return (
    <Screen centered progress={progress} onClose={onClose} closeLabel="終える" title={withTone && beat.toneMs > 0 ? '吸いながら聞く' : '息を吸う'} note={caption}>
      <div class="timebar">
        <span ref={bar} />
      </div>
    </Screen>
  );
}

function TimerHum({ beat, caption, progress, onClose, onDone }: BeatProps<Extract<Beat, { kind: 'hum' }>>) {
  const bar = useCountdown(scaled(beat.ms), onDone);
  return (
    <Screen centered progress={progress} onClose={onClose} closeLabel="終える" title="「んー」" note={caption}>
      <div class="timebar">
        <span ref={bar} />
      </div>
    </Screen>
  );
}

function Rest({ beat, progress, onClose, onDone }: BeatProps<Extract<Beat, { kind: 'rest' }>>) {
  const total = scaled(beat.ms);
  const [left, setLeft] = useState(total);
  const latest = useLatest(onDone);
  useEffect(() => {
    const started = performance.now();
    const timer = setInterval(() => {
      const remaining = total - (performance.now() - started);
      setLeft(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        latest.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [total]);
  const seconds = Math.max(0, Math.ceil(left / 1000));
  return (
    <Screen
      centered
      progress={progress}
      onClose={onClose}
      closeLabel="終える"
      title="休憩"
      actions={
        <Btn quiet onClick={onDone}>
          次へ進む
        </Btn>
      }
    >
      <div class="hz">
        <span>{`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</span>
      </div>
    </Screen>
  );
}

interface SessionProps {
  mode: 'tuner' | 'timer';
  resumeFrom?: number;
}

// 今日のハミング。計画を拍の列に展開し、順に進めるだけにして再開を簡単にしている。
export function Session({ mode, resumeFrom }: SessionProps) {
  const { events, settings, append, setSetting, go } = useHum();
  useWakeLock();
  const plan = useMemo(() => {
    const stored = { ...DEFAULT_SESSION, ...(settings[SETTING_SESSION] as Partial<SessionSettings> | undefined) };
    return buildPlan(stored, planTones(stored, tonesForToday(events, currentTones(events)), latestProfile(events)));
  }, []);
  const [cursor, setCursor] = useState(resumeFrom != null ? resumeCursor(plan, resumeFrom) : 0);
  const [stage, setStage] = useState<'run' | 'drainage' | 'nose' | 'done'>('run');
  const [completed, setCompleted] = useState(false);
  const [drainage, setDrainage] = useState<Drainage | null>(null);
  const startedAt = useRef(Date.now());
  const results = useRef<SessionToneResult[]>(
    plan.tones.map((t) => ({ toneId: t.toneId, hz: t.hz, hums: 0, voicedSec: 0, inTuneRatio: mode === 'tuner' ? 0 : null })),
  );
  const home = () => go({ name: 'home' });
  const totalHums = () => results.current.reduce((sum, r) => sum + r.hums, 0);

  const saveProgress = (next: number) => {
    const progress: SessionProgress = { day: logicalDay(new Date()), signature: plan.signature, cursor: next, mode };
    void setSetting(SETTING_PROGRESS, progress);
  };

  const finish = (done: boolean) => {
    setCompleted(done);
    if (done) void setSetting(SETTING_PROGRESS, null);
    if (totalHums() === 0) home();
    else setStage('drainage');
  };

  const advance = () => {
    const next = cursor + 1;
    if (next >= plan.beats.length) finish(true);
    else setCursor(next);
  };

  const recordHum = (toneIndex: number, summary: TrackSummary | null) => {
    const result = results.current[toneIndex];
    if (summary && result.inTuneRatio != null) {
      result.inTuneRatio = (result.inTuneRatio * result.hums + summary.inTuneRatio) / (result.hums + 1);
      result.voicedSec += summary.voicedSec;
    }
    result.hums += 1;
    saveProgress(cursor + 1);
    advance();
  };

  const save = async (noseChange: NoseChange | null) => {
    const record: SessionRecord = {
      preset: plan.preset,
      mode,
      completed,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      tones: results.current,
      drainage,
      noseChange,
    };
    await append(KIND_SESSION, record);
    setStage('done');
  };

  if (stage === 'drainage') {
    return (
      <Screen
        title="流れる感じはありましたか"
        actions={
          <>
            <Btn onClick={() => { setDrainage('none'); setStage('nose'); }}>なかった</Btn>
            <Btn onClick={() => { setDrainage('some'); setStage('nose'); }}>少しあった</Btn>
            <Btn onClick={() => { setDrainage('clear'); setStage('nose'); }}>はっきりあった</Btn>
          </>
        }
      />
    );
  }
  if (stage === 'nose') {
    return (
      <Screen
        title="始める前と比べて、鼻の通りは"
        actions={
          <>
            <Btn onClick={() => save('better')}>良くなった</Btn>
            <Btn onClick={() => save('same')}>変わらない</Btn>
            <Btn onClick={() => save('worse')}>悪くなった</Btn>
            <Btn quiet onClick={() => save(null)}>
              答えない
            </Btn>
          </>
        }
      />
    );
  }
  if (stage === 'done') {
    return (
      <Screen
        title={completed ? '今日のハミングを記録しました' : '途中までを記録しました'}
        note={completed ? undefined : '今日のうちなら、ホームから続きを始められます。'}
        actions={
          <Btn primary onClick={home}>
            ホームへ
          </Btn>
        }
      />
    );
  }

  const beat = plan.beats[cursor];
  const tone = plan.tones[beat.toneIndex];
  const progress = cursor / plan.beats.length;
  const caption = beat.kind === 'rest' ? '' : `${tone.label}　${beat.rep + 1} / ${beat.reps}`;
  const close = () => finish(false);

  if (beat.kind === 'rest') {
    return <Rest key={cursor} beat={beat} caption="" progress={progress} onClose={close} onDone={advance} />;
  }
  if (beat.kind === 'breath') {
    return <Breath key={cursor} beat={beat} hz={tone.hz} withTone={mode === 'tuner'} caption={caption} progress={progress} onClose={close} onDone={advance} />;
  }
  if (mode === 'timer') {
    return <TimerHum key={cursor} beat={beat} caption={caption} progress={progress} onClose={close} onDone={() => recordHum(beat.toneIndex, null)} />;
  }
  return (
    <HumPhase
      key={cursor}
      targetHz={tone.hz}
      ms={beat.ms}
      title="「んー」"
      caption={caption}
      progress={progress}
      onClose={close}
      onDone={(summary) => recordHum(beat.toneIndex, summary)}
    />
  );
}
