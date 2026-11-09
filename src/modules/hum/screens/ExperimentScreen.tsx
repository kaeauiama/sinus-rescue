import { useState } from 'preact/hooks';
import { dayDiff, logicalDay } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import {
  EXPERIMENT_INTRO,
  EXPERIMENT_LIMITS,
  EXPERIMENT_NO_DIFFERENCE,
  EXPERIMENT_UNUSABLE,
  experimentDifferenceText,
} from '../copy';
import { useHum } from '../context';
import {
  analyzeExperiment,
  blockOutcomes,
  CONDITION_LABELS,
  conditionOn,
  createExperiment,
  currentExperiment,
  experimentDays,
  KIND_EXPERIMENT,
  type ExperimentRecord,
} from '../domain/experiment';
import { currentTones } from '../domain/tones';

export function ExperimentScreen() {
  const { events, append, go } = useHum();
  const [confirming, setConfirming] = useState(false);
  const today = logicalDay(new Date());
  const experiment = currentExperiment(events);
  const hasTones = currentTones(events).length > 0;
  const close = () => go({ name: 'home' });

  const start = async () => {
    const result = createExperiment('hum-tone', today);
    if (result.ok) await append<ExperimentRecord>(KIND_EXPERIMENT, result.record);
  };

  const stop = async () => {
    if (experiment) await append<ExperimentRecord>(KIND_EXPERIMENT, { action: 'stop', experimentId: experiment.experimentId });
    setConfirming(false);
  };

  if (!experiment) {
    return (
      <Screen
        title="2つの音を比べる"
        align="top"
        onClose={close}
        closeLabel="戻る"
        actions={
          hasTones ? (
            <Btn primary onClick={start}>
              始める
            </Btn>
          ) : undefined
        }
      >
        <ul class="plain">
          {EXPERIMENT_INTRO.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {!hasTones && <p class="note">比べるには、先に響く音を1つ登録してください。</p>}
      </Screen>
    );
  }

  const result = analyzeExperiment(experiment, events, today);

  if (result.status === 'pending') {
    const condition = conditionOn(experiment, today);
    const usable = blockOutcomes(experiment, events).reduce((sum, block) => sum + block.scores.length, 0);
    if (confirming) {
      return (
        <Screen
          title="比較をやめますか"
          onBack={() => setConfirming(false)}
          note="ここまでの記録は残りますが、結果は出せなくなります。"
          actions={
            <>
              <Btn onClick={stop}>やめる</Btn>
              <Btn primary onClick={() => setConfirming(false)}>
                続ける
              </Btn>
            </>
          }
        />
      );
    }
    return (
      <Screen
        title={condition ? `今日は${CONDITION_LABELS[condition]}` : '比較の準備中'}
        note={`${dayDiff(experiment.startDay, today) + 1} / ${experimentDays(experiment)}日目。比べられる記録は${usable}日分です。`}
        onClose={close}
        closeLabel="戻る"
        actions={
          <Btn quiet onClick={() => setConfirming(true)}>
            比較をやめる
          </Btn>
        }
      >
        <p class="note">今日のハミングは、この音で案内します。結果は期間が終わるまで出ません。</p>
      </Screen>
    );
  }

  const finish = (
    <Btn onClick={stop}>
      この結果を閉じる
    </Btn>
  );

  if (result.status === 'unusable') {
    return (
      <Screen title="比較の結果" note={`${EXPERIMENT_UNUSABLE}（${result.code}）`} onClose={close} closeLabel="戻る" actions={finish} />
    );
  }

  return (
    <Screen title="比較の結果" align="top" onClose={close} closeLabel="戻る" actions={finish}>
      <p class="note">
        {result.status === 'difference' ? experimentDifferenceText(result.registeredMean, result.usualMean) : EXPERIMENT_NO_DIFFERENCE}
      </p>
      <dl class="result">
        <div>
          <dt>{`${CONDITION_LABELS.registered}の翌朝`}</dt>
          <dd>{result.registeredMean}</dd>
        </div>
        <div>
          <dt>{`${CONDITION_LABELS.usual}の翌朝`}</dt>
          <dd>{result.usualMean}</dd>
        </div>
      </dl>
      <p class="note">{EXPERIMENT_LIMITS}</p>
    </Screen>
  );
}
