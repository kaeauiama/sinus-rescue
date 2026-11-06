import { useState } from 'preact/hooks';
import { logicalDay } from '../../../platform/events';
import { Btn, Screen, ScoreGrid } from '../../../platform/ui';
import { KIND_MORNING, SETTING_MORNING_SKIPPED, type MorningRecord } from '../../hum/domain/history';
import { useDaily } from '../context';
import { KIND_SLEEP, type SleepRecord } from '../domain/timeline';

const SLEEP_HOURS = [4, 5, 6, 7, 8, 9];

// 翌朝の鼻の通りはハミング側の記録を使い、同じ質問を重複させない。
export function MorningCheck() {
  const { append, setSetting, go } = useDaily();
  const [step, setStep] = useState<'nose' | 'sleep' | 'hours'>('nose');
  const [satisfaction, setSatisfaction] = useState(0);

  const answerNose = async (score: number) => {
    await append<MorningRecord>(KIND_MORNING, { score });
    setStep('sleep');
  };

  const skip = async () => {
    await setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
    go({ name: 'today' });
  };

  const finish = async (hours: number | null) => {
    await append<SleepRecord>(KIND_SLEEP, { satisfaction, hours });
    go({ name: 'today' });
  };

  if (step === 'nose') {
    return (
      <Screen
        title="今朝の鼻の通りは"
        note="0 詰まっている　10 よく通る"
        actions={
          <>
            <ScoreGrid onPick={answerNose} />
            <Btn quiet onClick={skip}>
              今日は答えない
            </Btn>
          </>
        }
      />
    );
  }

  if (step === 'sleep') {
    return (
      <Screen
        title="昨夜の眠りは"
        note="0 眠れなかった　10 よく眠れた"
        actions={
          <>
            <ScoreGrid
              onPick={(score) => {
                setSatisfaction(score);
                setStep('hours');
              }}
            />
            <Btn quiet onClick={() => go({ name: 'today' })}>
              飛ばす
            </Btn>
          </>
        }
      />
    );
  }

  return (
    <Screen
      title="何時間くらい眠りましたか"
      actions={
        <>
          <div class="choices row-3">
            {SLEEP_HOURS.map((hours) => (
              <Btn key={hours} onClick={() => finish(hours)}>
                {`${hours}時間`}
              </Btn>
            ))}
          </div>
          <Btn quiet onClick={() => finish(null)}>
            飛ばす
          </Btn>
        </>
      }
    />
  );
}
