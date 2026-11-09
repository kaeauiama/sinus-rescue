import { useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { useHum } from '../context';
import { noteName } from '../domain/dsp';
import { toneLabel } from '../domain/sites';
import { currentTones, KIND_TONE_REMOVED } from '../domain/tones';
import { HUM_TONE_SEC } from '../rules';

const STRENGTHS = { 1: '弱い', 2: 'ふつう', 3: '強い' };

export function ToneDetail({ toneId }: { toneId: string }) {
  const { events, engine, append, go, openWithMic } = useHum();
  const [confirming, setConfirming] = useState(false);
  const tone = currentTones(events).find((t) => t.toneId === toneId);
  const home = () => go({ name: 'home' });
  if (!tone) {
    return <Screen title="この音は削除されています" onBack={home} actions={<Btn onClick={home}>ホームへ</Btn>} />;
  }

  const play = async () => {
    await engine.prepare({ mic: false });
    engine.playTone(tone.hz, HUM_TONE_SEC * 1000);
  };
  const remove = async () => {
    await append(KIND_TONE_REMOVED, { toneId });
    home();
  };

  if (confirming) {
    return (
      <Screen
        title={`${toneLabel(tone.site)}を削除しますか`}
        onBack={() => setConfirming(false)}
        note="これまでの記録は残ります。"
        actions={
          <>
            <Btn primary onClick={remove}>
              削除する
            </Btn>
            <Btn quiet onClick={() => setConfirming(false)}>
              やめる
            </Btn>
          </>
        }
      />
    );
  }

  return (
    <Screen
      title={toneLabel(tone.site)}
      align="top"
      onClose={home}
      closeLabel="戻る"
      actions={
        <>
          <Btn primary onClick={() => openWithMic({ name: 'register', toneId })}>
            登録し直す
          </Btn>
          <Btn quiet onClick={() => setConfirming(true)}>
            削除する
          </Btn>
        </>
      }
    >
      <div class="note-value big">
        <strong>{noteName(tone.hz)}</strong>
        <span>{Math.round(tone.hz)}Hz</span>
      </div>
      <div class="center-row">
        <button type="button" class="link" onClick={play}>
          音を聞く
        </button>
      </div>
      <h2>これまでの登録</h2>
      <dl class="result">
        {[...tone.history].reverse().map((entry) => (
          <div key={entry.ts}>
            <dt>{entry.ts.slice(5, 10).replace('-', '/')}</dt>
            <dd>{`${noteName(entry.hz)}  ${Math.round(entry.hz)}Hz  ${STRENGTHS[entry.strength]}`}</dd>
          </div>
        ))}
      </dl>
    </Screen>
  );
}
