import { useState } from 'preact/hooks';
import { BackupPanel } from '../../../platform/BackupPanel';
import { Btn, Group, ListRow, Screen } from '../../../platform/ui';
import { useHum } from '../context';

// ハミングだけで使うときの設定。日々の記録の入口は、外から渡された部品をそのまま置く(HC-8)。
export function HumSettings() {
  const { events, settings, store, nav, settingsExtra, go, appendAll, setSetting, resetAll } = useHum();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <Screen
        title="すべてのデータを削除しますか"
        note="登録した音と記録がこの端末から消え、元に戻せません。必要なら先に書き出してください。"
        actions={
          <>
            <Btn onClick={resetAll}>削除する</Btn>
            <Btn primary onClick={() => setConfirming(false)}>
              やめる
            </Btn>
          </>
        }
      />
    );
  }

  return (
    <Screen align="top" footer={nav}>
      <header class="page-head">
        <h1>設定</h1>
      </header>
      <Group title="ハミング">
        <ListRow icon="list" tone="violet" label="ハミングのメニュー" onClick={() => go({ name: 'programs' })} />
      </Group>
      {settingsExtra}
      <BackupPanel events={events} settings={settings} persistent={store.persistent} appendAll={appendAll} setSetting={setSetting} />
      <Group title="このアプリについて">
        <ListRow icon="info" tone="gray" label="情報" sub="注意書きと相談の目安" onClick={() => go({ name: 'info' })} />
      </Group>
      <Group>
        <ListRow icon="trash" danger label="すべてのデータを削除する" onClick={() => setConfirming(true)} />
      </Group>
    </Screen>
  );
}
