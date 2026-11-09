import { useState } from 'preact/hooks';
import { BackupPanel } from '../../../platform/BackupPanel';
import { Btn, Group, ListRow, Screen } from '../../../platform/ui';
import { SETTING_HIDE_CHART, useDaily } from '../context';

export function DailySettings() {
  const { events, settings, store, nav, go, appendAll, setSetting, resetAll, disable } = useDaily();
  const [confirming, setConfirming] = useState(false);
  const hideChart = Boolean(settings[SETTING_HIDE_CHART]);

  if (confirming) {
    return (
      <Screen
        title="すべてのデータを削除しますか"
        onBack={() => setConfirming(false)}
        note="ハミングを含むすべての記録がこの端末から消え、元に戻せません。必要なら先に書き出してください。"
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
      <Group title="日々の記録">
        <ListRow icon="list" tone="teal" label="ルーチンの項目" onClick={() => go({ name: 'routine' })} />
        <ListRow icon="tag" tone="coral" label="タグ" onClick={() => go({ name: 'tagEdit' })} />
        <ListRow icon="drop" tone="teal" label="洗浄の手順" onClick={() => go({ name: 'rinse' })} />
        <ListRow icon="bell" tone="indigo" label="リマインダー" sub="カレンダーに書き出します" onClick={() => go({ name: 'reminders' })} />
        <ListRow
          icon="chart"
          tone="gray"
          label="経過のグラフを隠す"
          role="switch"
          checked={hideChart}
          onClick={() => setSetting(SETTING_HIDE_CHART, !hideChart)}
        />
      </Group>

      <BackupPanel events={events} settings={settings} persistent={store.persistent} appendAll={appendAll} setSetting={setSetting} />

      <Group title="このアプリについて">
        <ListRow icon="info" tone="gray" label="情報" sub="注意書きと相談の目安" onClick={() => go({ name: 'info' })} />
      </Group>

      <Group title="使い方" note="ハミングだけの画面に戻ります。記録は残り、もう一度使い始められます。">
        <ListRow icon="wave" tone="violet" label="ハミングだけにする" onClick={disable} />
      </Group>

      <Group>
        <ListRow icon="trash" danger label="すべてのデータを削除する" onClick={() => setConfirming(true)} />
      </Group>
    </Screen>
  );
}
