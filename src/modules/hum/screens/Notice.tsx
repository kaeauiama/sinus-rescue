import { Btn, Screen } from '../../../platform/ui';
import { DANGER_SIGNS, DANGER_TITLE, NOTICE_LINES } from '../copy';
import { SETTING_NOTICE, useHum } from '../context';

// 初回に全員へ1回だけ表示する。以後は情報ページに置く(HC-3)。
export function Notice() {
  const { setSetting, go, entry } = useHum();
  const accept = async () => {
    await setSetting(SETTING_NOTICE, new Date().toISOString());
    go({ name: entry });
  };
  return (
    <Screen
      title="はじめに"
      align="top"
      actions={
        <Btn primary onClick={accept}>
          わかりました
        </Btn>
      }
    >
      <ul class="plain">
        {NOTICE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <h2>{DANGER_TITLE}</h2>
      <ul class="plain muted">
        {DANGER_SIGNS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Screen>
  );
}
