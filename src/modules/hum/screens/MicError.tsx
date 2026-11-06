import { Btn, Screen } from '../../../platform/ui';
import type { MicFailure } from '../audio/engine';
import { useHum } from '../context';

const MESSAGES: Record<MicFailure, { title: string; note: string }> = {
  MIC_DENIED: {
    title: 'マイクを使えません',
    note: 'マイクの使用が許可されていません。端末の設定で許可すると、音程を合わせる機能を使えます。',
  },
  MIC_UNAVAILABLE: {
    title: 'マイクが見つかりません',
    note: 'マイクを取得できませんでした。他のアプリがマイクを使っていないか確かめてください。',
  },
};

export function MicError({ code }: { code: MicFailure }) {
  const { go, openWithoutMic } = useHum();
  const message = MESSAGES[code];
  return (
    <Screen
      title={message.title}
      note={`${message.note}（${code}）`}
      actions={
        <>
          <Btn primary onClick={() => openWithoutMic({ name: 'session', mode: 'timer' })}>
            タイマーだけ使う
          </Btn>
          <Btn quiet onClick={() => go({ name: 'home' })}>
            戻る
          </Btn>
        </>
      }
    />
  );
}
