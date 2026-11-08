import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { logicalDay } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import { HumPhase, useCountdown } from '../components/Phases';
import { CONTACT_CUE, NOSE_CUES, NOSE_LABELS, NOSE_TITLES } from '../copy';
import { useHum, useLatest, useWakeLock } from '../context';
import { scaled } from '../debug';
import { median, type TrackSummary } from '../domain/dsp';
import { SETTING_COMPARE_CONTACT, todayPlan } from '../domain/programs';
import {
  KIND_SESSION,
  resumeCursor,
  SETTING_PROGRESS,
  type Beat,
  type Drainage,
  type Nose,
  type NoseChange,
  type PlanTone,
  type PostureResult,
  type SessionProgress,
  type SessionRecord,
  type SessionToneResult,
} from '../domain/session';

interface BeatProps<B extends Beat> {
  beat: B;
  caption: string;
  progress: number;
  onClose: () => void;
  onDone: () => void;
}

const RATINGS: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: '弱い' },
  { value: 2, label: 'ふつう' },
  { value: 3, label: '強い' },
];

const cueKey = (beat: { nose: Nose; flush?: boolean }) => (beat.flush ? 'flush' : beat.nose);

function Breath({ beat, caption, tone, progress, withTone, onClose, onDone }: BeatProps<Extract<Beat, { kind: 'breath' }>> & { tone: PlanTone; withTone: boolean }) {
  const { engine } = useHum();
  useEffect(() => {
    if (!withTone || beat.toneMs <= 0) return undefined;
    return engine.playTone(tone.hz, scaled(beat.toneMs), tone.toHz);
  }, [engine, tone, beat, withTone]);
  const bar = useCountdown(scaled(beat.ms), onDone);
  const title = beat.flush ? '鼻を離して吸う' : withTone && beat.toneMs > 0 ? '吸いながら聞く' : '息を吸う';
  return (
    <Screen centered progress={progress} onClose={onClose} closeLabel="終える" title={title} note={caption}>
      {beat.nose !== 'open' && <p class="cue">{`次は${NOSE_LABELS[beat.nose]}: ${NOSE_CUES[beat.nose]}`}</p>}
      <div class="timebar">
        <span ref={bar} />
      </div>
    </Screen>
  );
}

function TimerHum({ beat, caption, cue, progress, onClose, onDone }: BeatProps<Extract<Beat, { kind: 'hum' }>> & { cue: string }) {
  const bar = useCountdown(scaled(beat.ms), onDone);
  return (
    <Screen centered progress={progress} onClose={onClose} closeLabel="終える" title={NOSE_TITLES[cueKey(beat)]} note={caption}>
      <p class="cue">{cue}</p>
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

// 今日のハミング。メニューを拍の列に展開し、順に進めるだけにして再開を簡単にしている。
export function Session({ mode, resumeFrom }: SessionProps) {
  const { events, settings, append, setSetting, go } = useHum();
  useWakeLock();
  const plan = useMemo(() => todayPlan(events, settings, logicalDay(new Date())), []);
  const placement = plan.programId === 'compare' && settings[SETTING_COMPARE_CONTACT] ? 'contact' : 'air';
  const [cursor, setCursor] = useState(resumeFrom != null ? resumeCursor(plan, resumeFrom) : 0);
  const [stage, setStage] = useState<'run' | 'drainage' | 'nose' | 'done'>('run');
  const [completed, setCompleted] = useState(false);
  const [drainage, setDrainage] = useState<Drainage | null>(null);
  const startedAt = useRef(Date.now());
  const results = useRef<SessionToneResult[]>(
    plan.tones.map((t) => ({ toneId: t.toneId, hz: t.hz, hums: 0, voicedSec: 0, inTuneRatio: mode === 'tuner' ? 0 : null })),
  );
  const levels = useRef(new Map<number, number[]>());
  const postures = useRef(new Map<number, PostureResult>());
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

  const recordHum = (beat: Extract<Beat, { kind: 'hum' }>, summary: TrackSummary | null) => {
    const result = results.current[beat.toneIndex];
    if (summary && result.inTuneRatio != null) {
      result.inTuneRatio = (result.inTuneRatio * result.hums + summary.inTuneRatio) / (result.hums + 1);
      result.voicedSec += summary.voicedSec;
    }
    if (!beat.flush && summary?.levelDb != null) {
      levels.current.set(beat.part, [...(levels.current.get(beat.part) ?? []), summary.levelDb]);
    }
    result.hums += 1;
    saveProgress(cursor + 1);
    advance();
  };

  const rate = (beat: Extract<Beat, { kind: 'rate' }>, rating: 1 | 2 | 3 | null) => {
    const level = median(levels.current.get(beat.part) ?? []);
    postures.current.set(beat.part, { nose: beat.nose, rating, levelDb: level == null ? null : Math.round(level) });
    advance();
  };

  const postureList = () => [...postures.current.values()];

  const save = async (noseChange: NoseChange | null) => {
    const rated = postureList();
    const record: SessionRecord = {
      preset: plan.preset,
      programId: plan.programId,
      programName: plan.name,
      mode,
      completed,
      durationSec: Math.round((Date.now() - startedAt.current) / 1000),
      tones: results.current,
      ...(rated.length ? { postures: rated, placement } : {}),
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
    const rated = postureList().sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    return (
      <Screen
        title={completed ? '記録しました' : '途中までを記録しました'}
        note={completed ? undefined : '今日のうちなら、ホームから続きを始められます。'}
        align={rated.length ? 'top' : 'middle'}
        actions={
          <Btn primary onClick={home}>
            ホームへ
          </Btn>
        }
      >
        {rated.length > 0 && (
          <>
            <h2>{placement === 'contact' ? '構えくらべ(鼻の横で測った音量)' : '構えくらべ'}</h2>
            <dl class="result">
              {rated.map((p) => (
                <div key={p.nose}>
                  <dt>{NOSE_LABELS[p.nose]}</dt>
                  <dd>{`${RATINGS.find((r) => r.value === p.rating)?.label ?? '答えなし'}${p.levelDb == null ? '' : `  ${p.levelDb}dB`}`}</dd>
                </div>
              ))}
            </dl>
            <p class="note">体感と音量の記録です。副鼻腔の中を測ったものではありません。</p>
          </>
        )}
      </Screen>
    );
  }

  const beat = plan.beats[cursor];
  const tone = plan.tones[beat.toneIndex];
  const progress = cursor / plan.beats.length;
  const close = () => finish(false);

  if (beat.kind === 'rest') {
    return <Rest key={cursor} beat={beat} caption="" progress={progress} onClose={close} onDone={advance} />;
  }
  if (beat.kind === 'rate') {
    return (
      <Screen
        title="鼻の周りの震えは"
        note={`「${NOSE_LABELS[beat.nose]}」で行った分`}
        progress={progress}
        onClose={close}
        closeLabel="終える"
        actions={
          <>
            <div class="choices row-3">
              {RATINGS.map((r) => (
                <button type="button" key={r.value} onClick={() => rate(beat, r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
            <Btn quiet onClick={() => rate(beat, null)}>
              答えない
            </Btn>
          </>
        }
      />
    );
  }

  const caption = `${tone.label}　${beat.rep + 1} / ${beat.reps}`;
  if (beat.kind === 'breath') {
    return <Breath key={cursor} beat={beat} tone={tone} withTone={mode === 'tuner'} caption={caption} progress={progress} onClose={close} onDone={advance} />;
  }
  const cue = placement === 'contact' && !beat.flush ? `${NOSE_CUES[cueKey(beat)]}。${CONTACT_CUE}` : NOSE_CUES[cueKey(beat)];
  if (mode === 'timer') {
    return <TimerHum key={cursor} beat={beat} cue={cue} caption={caption} progress={progress} onClose={close} onDone={() => recordHum(beat, null)} />;
  }
  return (
    <HumPhase
      key={cursor}
      targetHz={tone.hz}
      toHz={tone.toHz}
      ms={beat.ms}
      title={NOSE_TITLES[cueKey(beat)]}
      caption={caption}
      cue={cue}
      progress={progress}
      onClose={close}
      closeLabel="終える"
      onDone={(summary) => recordHum(beat, summary)}
    />
  );
}
