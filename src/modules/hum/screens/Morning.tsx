import { logicalDay } from '../../../platform/events';
import { Btn, Screen, ScoreGrid } from '../../../platform/ui';
import { useHum } from '../context';
import { KIND_MORNING, SETTING_MORNING_SKIPPED, type MorningRecord } from '../domain/history';

export function Morning() {
  const { append, setSetting, go } = useHum();
  const answer = async (score: number) => {
    await append<MorningRecord>(KIND_MORNING, { score });
    go({ name: 'home' });
  };
  const skip = async () => {
    await setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
    go({ name: 'home' });
  };
  return (
    <Screen
      title="今朝の鼻の通りは"
      note="0 詰まっている　10 よく通る"
      actions={
        <>
          <ScoreGrid onPick={answer} />
          <Btn quiet onClick={skip}>
            今日は答えない
          </Btn>
        </>
      }
    />
  );
}
