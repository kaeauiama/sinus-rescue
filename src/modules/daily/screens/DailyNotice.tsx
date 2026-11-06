import { logicalDay } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import { DAILY_NOTICE_LINES, WATER_LINES, WATER_TITLE } from '../copy';
import { SETTING_DAILY_NOTICE, useDaily } from '../context';
import { SETTING_STARTED } from '../domain/routine';

export function DailyNotice() {
  const { go, setSetting, entry } = useDaily();
  const start = async () => {
    await setSetting(SETTING_STARTED, logicalDay(new Date()));
    await setSetting(SETTING_DAILY_NOTICE, new Date().toISOString());
    go({ name: entry });
  };
  return (
    <Screen
      title="日々の記録について"
      align="top"
      actions={
        <Btn primary onClick={start}>
          始める
        </Btn>
      }
    >
      <ul class="plain">
        {DAILY_NOTICE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h2>{WATER_TITLE}</h2>
      <ul class="plain muted">
        {WATER_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Screen>
  );
}
