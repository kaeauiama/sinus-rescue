import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { FaceMap } from '../components/FaceMap';
import { HumPhase, ListenPhase, LiveHz } from '../components/Phases';
import { useHum, useWakeLock } from '../context';
import { hzToMidi, midiToHz, noteName, snapToSemitone, type CapturePoint, type TrackSummary } from '../domain/dsp';
import { classifyMatch } from '../domain/match';
import { noteLabel } from '../domain/session';
import { SITES, siteOf, toneLabel, type SiteId } from '../domain/sites';
import {
  currentTones,
  deltaText,
  KIND_TONE,
  latestProfile,
  semitoneDelta,
  stableF0,
  sweepCandidates,
  sweepTargets,
  type Clearness,
  type Strength,
  type SweepTrial,
  type ToneRecord,
} from '../domain/tones';
import { shuffled } from '../domain/random';
import {
  FINE_STEP_SEMITONES,
  HUM_HOLD_SEC,
  HUM_TONE_SEC,
  LEVEL_TOLERANCE_DB,
  STABLE_MIN_FRAMES,
  STABLE_WINDOW_MS,
  SWEEP_HIGH_LIMIT_HZ,
  SWEEP_LOW_LIMIT_HZ,
} from '../rules';

const SIM_FREE_HZ = 196;

function PickSite({ onPick, onClose }: { onPick: (site: SiteId) => void; onClose: () => void }) {
  return (
    <Screen title="どこを響かせますか" align="top" onClose={onClose} closeLabel="やめる">
      <FaceMap onPick={onPick} />
      <div class="choices">
        {SITES.map((site) => (
          <button key={site.id} type="button" class="row-button" onClick={() => onPick(site.id)}>
            <span>{site.name}</span>
            <small>{site.sinus}</small>
          </button>
        ))}
      </div>
    </Screen>
  );
}

function PickMethod({ site, onPick, onBack }: { site: SiteId; onPick: (method: 'self' | 'auto') => void; onBack: () => void }) {
  return (
    <Screen
      title={`${siteOf(site).name}が響く音を探します`}
      note={site === 'forehead' ? '額は裏声で響くことがあります。裏声も試してみてください。' : undefined}
      onClose={onBack}
      closeLabel="戻る"
      actions={
        <>
          <button type="button" class="row-button" onClick={() => onPick('self')}>
            <span>自分で探す</span>
            <small>声をゆっくり上下させ、響いたら押します</small>
          </button>
          <button type="button" class="row-button" onClick={() => onPick('auto')}>
            <span>おまかせ</span>
            <small>流れる音に順に合わせて試します</small>
          </button>
        </>
      }
    />
  );
}

function FindSelf({ site, onFound, onBack }: { site: SiteId; onFound: (hz: number, measuredHz: number) => void; onBack: () => void }) {
  const { engine } = useHum();
  const points = useRef<CapturePoint[]>([]);
  const [missed, setMissed] = useState(false);
  useEffect(() => {
    engine.simulateHum(SIM_FREE_HZ);
    return () => engine.simulateHum(null);
  }, [engine]);
  const mark = () => {
    const hz = stableF0(points.current, STABLE_WINDOW_MS, STABLE_MIN_FRAMES);
    if (hz == null) {
      setMissed(true);
      return;
    }
    onFound(snapToSemitone(hz), hz);
  };
  return (
    <Screen
      centered
      title={`${siteOf(site).name}が響く高さを探す`}
      note={missed ? '声が聞き取れませんでした。「んー」と出しながら押してください。' : '声をゆっくり上下させ、響いたら押します。'}
      onClose={onBack}
      closeLabel="戻る"
      actions={
        <Btn primary onClick={mark}>
          ここ
        </Btn>
      }
    >
      <LiveHz onFrame={(point) => points.current.push(point)} />
    </Screen>
  );
}

function FindAuto({ site, onFound, onSwitch, onBack }: { site: SiteId; onFound: (candidates: number[], trials: SweepTrial[]) => void; onSwitch: () => void; onBack: () => void }) {
  const { events } = useHum();
  const targets = useMemo(() => {
    const profile = latestProfile(events);
    return profile ? shuffled(sweepTargets(profile, site)) : [];
  }, [events, site]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<'listen' | 'hum' | 'octave' | 'rate' | 'none'>(targets.length ? 'listen' : 'none');
  const [summary, setSummary] = useState<TrackSummary | null>(null);
  const trials = useRef<SweepTrial[]>([]);
  const progress = (index + (phase === 'rate' ? 1 : 0)) / Math.max(1, targets.length);
  const targetHz = targets[index];

  const finish = () => {
    const candidates = sweepCandidates(trials.current);
    if (candidates.length) onFound(candidates, trials.current);
    else setPhase('none');
  };

  const rate = (rating: 0 | 1 | 2) => {
    trials.current.push({ targetHz, measuredHz: summary?.medianHz ?? null, rating, levelDb: summary?.levelDb ?? null });
    if (index + 1 < targets.length) {
      setIndex(index + 1);
      setPhase('listen');
    } else {
      finish();
    }
  };

  if (phase === 'none') {
    return (
      <Screen
        title="はっきり響く音はありませんでした"
        note="自分で声を上下させて探すと、見つかることがあります。"
        actions={
          <>
            <Btn primary onClick={onSwitch}>
              自分で探す
            </Btn>
            <Btn quiet onClick={onBack}>
              戻る
            </Btn>
          </>
        }
      />
    );
  }
  if (phase === 'listen') {
    return <ListenPhase key={`l${index}`} hz={targetHz} ms={HUM_TONE_SEC * 1000} progress={progress} onClose={onBack} onDone={() => setPhase('hum')} />;
  }
  if (phase === 'hum') {
    return (
      <HumPhase
        key={`h${index}`}
        targetHz={targetHz}
        ms={HUM_HOLD_SEC * 1000}
        progress={progress}
        onClose={onBack}
        onDone={(result) => {
          setSummary(result);
          const kind = classifyMatch(result);
          setPhase(kind === 'octave-low' || kind === 'octave-high' ? 'octave' : 'rate');
        }}
      />
    );
  }
  if (phase === 'octave') {
    const lower = classifyMatch(summary as TrackSummary) === 'octave-low';
    return (
      <Screen
        title={`1オクターブ${lower ? '低い' : '高い'}音でした`}
        note="同じ高さで出すのが難しければ、そのまま続けられます。"
        progress={progress}
        actions={
          <>
            <Btn primary onClick={() => setPhase('listen')}>
              もう一度
            </Btn>
            <Btn quiet onClick={() => setPhase('rate')}>
              この高さで続ける
            </Btn>
          </>
        }
      />
    );
  }
  const others = trials.current.map((t) => t.levelDb).filter((v): v is number => v != null);
  const average = others.length ? others.reduce((a, b) => a + b, 0) / others.length : null;
  const louder = average != null && summary?.levelDb != null && summary.levelDb - average > LEVEL_TOLERANCE_DB;
  return (
    <Screen
      title={`${siteOf(site).name}は響きましたか`}
      note={louder ? '今回は少し大きめの声でした。声の大きさは揃えてみてください。' : `${index + 1} / ${targets.length}`}
      progress={progress}
      onClose={onBack}
      closeLabel="戻る"
      actions={
        <>
          <Btn onClick={() => rate(0)}>響かない</Btn>
          <Btn onClick={() => rate(1)}>少し響く</Btn>
          <Btn onClick={() => rate(2)}>よく響く</Btn>
          <Btn
            quiet
            onClick={() => {
              trials.current.push({ targetHz, measuredHz: summary?.medianHz ?? null, rating: 2, levelDb: summary?.levelDb ?? null });
              finish();
            }}
          >
            この音に決める
          </Btn>
        </>
      }
    />
  );
}

interface ConfirmProps {
  site: SiteId;
  initialHz: number;
  candidates: number[];
  onConfirm: (hz: number, summary: TrackSummary, strength: Strength) => void;
  onBack: () => void;
}

function Confirm({ site, initialHz, candidates, onConfirm, onBack }: ConfirmProps) {
  const { engine } = useHum();
  const [midi, setMidi] = useState(Math.round(hzToMidi(initialHz)));
  const [phase, setPhase] = useState<'adjust' | 'listen' | 'hum' | 'rate'>('adjust');
  const [summary, setSummary] = useState<TrackSummary | null>(null);
  const hz = midiToHz(midi);
  const canDown = midiToHz(midi - FINE_STEP_SEMITONES) >= SWEEP_LOW_LIMIT_HZ;
  const canUp = midiToHz(midi + FINE_STEP_SEMITONES) <= SWEEP_HIGH_LIMIT_HZ;

  if (phase === 'listen') return <ListenPhase hz={hz} ms={HUM_TONE_SEC * 1000} onClose={() => setPhase('adjust')} onDone={() => setPhase('hum')} />;
  if (phase === 'hum') {
    return (
      <HumPhase
        targetHz={hz}
        ms={HUM_HOLD_SEC * 1000}
        onClose={() => setPhase('adjust')}
        onDone={(result) => {
          setSummary(result);
          setPhase('rate');
        }}
      />
    );
  }
  if (phase === 'rate') {
    return (
      <Screen
        title={`${siteOf(site).name}の響きは`}
        note={noteLabel(hz)}
        actions={
          <>
            <div class="choices row-3">
              <Btn onClick={() => onConfirm(hz, summary as TrackSummary, 1)}>弱い</Btn>
              <Btn onClick={() => onConfirm(hz, summary as TrackSummary, 2)}>ふつう</Btn>
              <Btn onClick={() => onConfirm(hz, summary as TrackSummary, 3)}>強い</Btn>
            </div>
            <Btn quiet onClick={() => setPhase('adjust')}>
              音を変える
            </Btn>
          </>
        }
      />
    );
  }
  return (
    <Screen
      centered
      title={`${siteOf(site).name}が響く音`}
      onClose={onBack}
      closeLabel="戻る"
      actions={
        <Btn primary onClick={() => setPhase('listen')}>
          この音で確かめる
        </Btn>
      }
    >
      <div class="note-stepper">
        <button type="button" class="round" aria-label="半音下げる" disabled={!canDown} onClick={() => setMidi(midi - FINE_STEP_SEMITONES)}>
          −
        </button>
        <div class="note-value">
          <strong>{noteName(hz)}</strong>
          <span>{Math.round(hz)}Hz</span>
        </div>
        <button type="button" class="round" aria-label="半音上げる" disabled={!canUp} onClick={() => setMidi(midi + FINE_STEP_SEMITONES)}>
          ＋
        </button>
      </div>
      <div class="center-row">
        <button type="button" class="link" onClick={() => engine.playTone(hz, 1500)}>
          音を聞く
        </button>
      </div>
      {candidates.length > 1 && (
        <div class="center-row chips">
          {candidates.map((candidate) => (
            <button
              key={candidate}
              type="button"
              class={`chip ${Math.round(hzToMidi(candidate)) === midi ? 'chip-active' : ''}`}
              onClick={() => setMidi(Math.round(hzToMidi(candidate)))}
            >
              {noteName(candidate)}
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}

interface RegisterProps {
  toneId?: string;
  site?: SiteId;
}

// 部位を選び、響く音を見つけて登録する流れ。
export function Register({ toneId, site: initialSite }: RegisterProps) {
  const { append, events, go } = useHum();
  useWakeLock();
  const previous = useMemo(() => currentTones(events).find((t) => t.toneId === toneId), [toneId]);
  const [site, setSite] = useState<SiteId | null>(previous?.site ?? initialSite ?? null);
  const [step, setStep] = useState<'method' | 'self' | 'auto' | 'confirm' | 'clearness' | 'done'>('method');
  const [method, setMethod] = useState<'self' | 'auto'>('self');
  const [found, setFound] = useState<{ hz: number; measuredHz: number | null; candidates: number[] }>({ hz: 0, measuredHz: null, candidates: [] });
  const [pending, setPending] = useState<{ hz: number; summary: TrackSummary; strength: Strength } | null>(null);
  const [saved, setSaved] = useState<ToneRecord | null>(null);
  const home = () => go({ name: 'home' });

  if (!site) return <PickSite onClose={home} onPick={setSite} />;

  const save = async (clearness: Clearness) => {
    if (!pending) return;
    const record: ToneRecord = {
      toneId: toneId ?? crypto.randomUUID(),
      site,
      hz: pending.hz,
      measuredHz: pending.summary.medianHz ?? found.measuredHz,
      levelDb: pending.summary.levelDb,
      strength: pending.strength,
      clearness,
      method,
    };
    await append(KIND_TONE, record);
    setSaved(record);
    setStep('done');
  };

  if (step === 'method') {
    return (
      <PickMethod
        site={site}
        onBack={() => (initialSite || previous ? home() : setSite(null))}
        onPick={(picked) => {
          setMethod(picked);
          setStep(picked);
        }}
      />
    );
  }
  if (step === 'self') {
    return (
      <FindSelf
        site={site}
        onBack={() => setStep('method')}
        onFound={(hz, measuredHz) => {
          setFound({ hz, measuredHz, candidates: [] });
          setStep('confirm');
        }}
      />
    );
  }
  if (step === 'auto') {
    return (
      <FindAuto
        site={site}
        onBack={() => setStep('method')}
        onSwitch={() => {
          setMethod('self');
          setStep('self');
        }}
        onFound={(candidates) => {
          setFound({ hz: candidates[0], measuredHz: null, candidates });
          setStep('confirm');
        }}
      />
    );
  }
  if (step === 'confirm') {
    return (
      <Confirm
        site={site}
        initialHz={found.hz}
        candidates={found.candidates}
        onBack={() => setStep('method')}
        onConfirm={(hz, summary, strength) => {
          setPending({ hz, summary, strength });
          setStep('clearness');
        }}
      />
    );
  }
  if (step === 'clearness') {
    return (
      <Screen
        title="今の鼻の通りは"
        note="響き方は鼻の通りで変わることがあるので、一緒に残します。"
        actions={
          <>
            <Btn onClick={() => save('clear')}>通っている</Btn>
            <Btn onClick={() => save('normal')}>ふつう</Btn>
            <Btn onClick={() => save('blocked')}>詰まっている</Btn>
            <Btn quiet onClick={() => save(null)}>
              答えない
            </Btn>
          </>
        }
      />
    );
  }
  return (
    <Screen
      title="登録しました"
      actions={
        <>
          <Btn primary onClick={home}>
            ホームへ
          </Btn>
          <Btn quiet onClick={() => go({ name: 'register', attempt: Date.now() })}>
            もう1音登録する
          </Btn>
        </>
      }
    >
      <dl class="result">
        <div>
          <dt>{toneLabel(site)}</dt>
          <dd>{noteLabel((saved as ToneRecord).hz)}</dd>
        </div>
        {previous && (
          <div>
            <dt>前回との差</dt>
            <dd>{deltaText(semitoneDelta(previous.hz, (saved as ToneRecord).hz))}</dd>
          </div>
        )}
      </dl>
    </Screen>
  );
}
