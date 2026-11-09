import { useEffect, useRef, useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { LiveHz, useCountdown } from '../components/Phases';
import { useHum, useWakeLock } from '../context';
import { scaled } from '../debug';
import { noteName, summarizeTrack, type CapturePoint } from '../domain/dsp';
import { KIND_PROFILE, type VoiceProfile } from '../domain/tones';
import { SETTLE_MS } from '../rules';

const CAPTURE_MS = 5000;
const PRACTICE_VOICED_FRAMES = 30;
const MIN_VOICED_RATIO = 0.3;

const SIM_HZ = { practice: 165, comfort: 139, low: 98, falsetto: 370 };

type Register = 'comfort' | 'low' | 'falsetto';

const REGISTERS: Record<Register, { title: string; note: string }> = {
  comfort: { title: '楽な高さで「んー」', note: '話すときに近い、いちばん楽な高さです。' },
  low: { title: '楽に出せる低い音で「んー」', note: '無理のない範囲で構いません。' },
  falsetto: { title: '裏声で「んー」', note: '楽に出せる高さで構いません。' },
};

function Capture({ register, onDone, onClose }: { register: Register; onDone: (hz: number | null) => void; onClose: () => void }) {
  const { engine } = useHum();
  const points = useRef<CapturePoint[]>([]);
  useEffect(() => {
    engine.simulateHum(SIM_HZ[register]);
    return () => engine.simulateHum(null);
  }, [engine, register]);
  const bar = useCountdown(scaled(CAPTURE_MS), () => {
    const summary = summarizeTrack(points.current, { settleMs: Math.min(scaled(SETTLE_MS), scaled(CAPTURE_MS) / 2) });
    onDone(summary.voicedRatio >= MIN_VOICED_RATIO ? summary.medianHz : null);
  });
  return (
    <Screen centered title={REGISTERS[register].title} onClose={onClose} closeLabel="やめる">
      <LiveHz onFrame={(point) => points.current.push(point)} />
      <div class="timebar">
        <span ref={bar} />
      </div>
    </Screen>
  );
}

function Practice({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { engine } = useHum();
  const [heard, setHeard] = useState(false);
  const voiced = useRef(0);
  useEffect(() => {
    engine.simulateHum(SIM_HZ.practice);
    return () => engine.simulateHum(null);
  }, [engine]);
  return (
    <Screen
      centered
      title="口を閉じて「んー」"
      note={heard ? '聞こえています。鼻のまわりの響きを感じてみてください。' : 'スマホを口元から20cmほどに持ちます。'}
      onClose={onClose}
      closeLabel="やめる"
      actions={
        <Btn primary={heard} quiet={!heard} onClick={onDone}>
          次へ
        </Btn>
      }
    >
      <LiveHz
        onFrame={(point) => {
          if (point.f0 != null) voiced.current++;
          if (!heard && voiced.current >= PRACTICE_VOICED_FRAMES) setHeard(true);
        }}
      />
    </Screen>
  );
}

// 初回の声の高さの測定。楽な高さを基準にするのは、M0 で「一番高い音」が大きくぶれたため。
export function Setup({ then }: { then?: 'register' }) {
  const { append, go } = useHum();
  useWakeLock();
  const [step, setStep] = useState<'practice' | 'ready-comfort' | 'comfort' | 'ready-low' | 'low' | 'ask-falsetto' | 'falsetto' | 'done'>('practice');
  const [retry, setRetry] = useState(false);
  const [comfortHz, setComfortHz] = useState<number | null>(null);
  const [lowHz, setLowHz] = useState<number | null>(null);
  const [falsettoHz, setFalsettoHz] = useState<number | null>(null);
  const home = () => go({ name: 'home' });

  const finish = async (falsetto: number | null) => {
    setFalsettoHz(falsetto);
    const profile: VoiceProfile = { comfortHz: comfortHz as number, lowHz: lowHz ?? (comfortHz as number), falsettoHz: falsetto };
    await append(KIND_PROFILE, profile);
    setStep('done');
  };

  const ready = (register: Register, next: 'comfort' | 'low') => (
    <Screen
      title={REGISTERS[register].title}
      note={retry ? 'うまく聞き取れませんでした。もう少し近づけて試してください。' : REGISTERS[register].note}
      onClose={home}
      closeLabel="やめる"
      actions={
        <Btn primary onClick={() => setStep(next)}>
          測る
        </Btn>
      }
    />
  );

  if (step === 'practice') return <Practice onClose={home} onDone={() => setStep('ready-comfort')} />;
  if (step === 'ready-comfort') return ready('comfort', 'comfort');
  if (step === 'comfort') {
    return (
      <Capture
        register="comfort"
        onClose={home}
        onDone={(hz) => {
          setRetry(hz == null);
          if (hz == null) {
            setStep('ready-comfort');
          } else {
            setComfortHz(hz);
            setStep('ready-low');
          }
        }}
      />
    );
  }
  if (step === 'ready-low') return ready('low', 'low');
  if (step === 'low') {
    return (
      <Capture
        register="low"
        onClose={home}
        onDone={(hz) => {
          setRetry(hz == null);
          if (hz == null) {
            setStep('ready-low');
          } else {
            setLowHz(hz);
            setStep('ask-falsetto');
          }
        }}
      />
    );
  }
  if (step === 'ask-falsetto') {
    return (
      <Screen
        title="裏声も測りますか"
        onBack={async () => {
          await finish(null);
          home();
        }}
        note="額など、裏声で響く場所を探すときに使います。あとからでも測れます。"
        actions={
          <>
            <Btn primary onClick={() => setStep('falsetto')}>
              測る
            </Btn>
            <Btn quiet onClick={() => finish(null)}>
              今はしない
            </Btn>
          </>
        }
      />
    );
  }
  if (step === 'falsetto') return <Capture register="falsetto" onClose={home} onDone={(hz) => finish(hz)} />;

  return (
    <Screen
      title="測定しました"
      onBack={home}
      actions={
        <Btn primary onClick={() => go(then === 'register' ? { name: 'register' } : { name: 'home' })}>
          {then === 'register' ? '音の登録へ' : '始める'}
        </Btn>
      }
    >
      <dl class="result">
        <div>
          <dt>楽な高さ</dt>
          <dd>{`${noteName(comfortHz as number)}  ${Math.round(comfortHz as number)}Hz`}</dd>
        </div>
        <div>
          <dt>低い音</dt>
          <dd>{`${noteName(lowHz as number)}  ${Math.round(lowHz as number)}Hz`}</dd>
        </div>
        {falsettoHz != null && (
          <div>
            <dt>裏声</dt>
            <dd>{`${noteName(falsettoHz)}  ${Math.round(falsettoHz)}Hz`}</dd>
          </div>
        )}
      </dl>
    </Screen>
  );
}
