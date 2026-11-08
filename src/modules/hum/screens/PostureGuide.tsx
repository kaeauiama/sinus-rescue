import { Btn, Screen } from '../../../platform/ui';
import { POSTURE_LINES, POSTURE_TITLE } from '../copy';
import { useHum, type Route } from '../context';
import { SETTING_POSTURE_SEEN } from '../domain/programs';

// 狭める、つまむ構えを初めて使う前に1回だけ見せる。以後はメニューの詳細と情報ページから開ける。
export function PostureGuide({ then }: Extract<Route, { name: 'postureGuide' }>) {
  const { setSetting, go, openWithMic, openWithoutMic } = useHum();
  const accept = () => {
    void setSetting(SETTING_POSTURE_SEEN, new Date().toISOString());
    if (!then) {
      go({ name: 'programs' });
      return;
    }
    const route = { name: 'session', mode: then.mode, resumeFrom: then.resumeFrom } as const;
    if (then.mode === 'tuner') openWithMic(route);
    else openWithoutMic(route);
  };
  return (
    <Screen
      title={POSTURE_TITLE}
      align="top"
      onClose={() => go({ name: then ? 'home' : 'programs' })}
      closeLabel="戻る"
      actions={
        <Btn primary onClick={accept}>
          {then ? 'わかりました、始める' : 'わかりました'}
        </Btn>
      }
    >
      <ul class="plain">
        {POSTURE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Screen>
  );
}
