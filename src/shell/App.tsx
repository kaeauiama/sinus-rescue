import { useCallback, useErrorBoundary, useEffect, useState } from 'preact/hooks';
import { registerServiceWorker } from '../platform/pwa';
import { openStore, type AppStore } from '../platform/store';
import { Btn, Group, ListRow, Screen, TabBar, type TabItem } from '../platform/ui';
import { dailyModule } from '../modules/daily';
import { humModule } from '../modules/hum';

export const SETTING_MODULES = 'shell.modules';

type TabId = 'today' | 'calendar' | 'hum' | 'settings';

const TAB: Record<TabId, TabItem> = {
  today: { id: 'today', label: '今日', icon: 'home' },
  calendar: { id: 'calendar', label: 'カレンダー', icon: 'calendar' },
  hum: { id: 'hum', label: 'ハミング', icon: 'wave' },
  settings: { id: 'settings', label: '設定', icon: 'sliders' },
};

const DAILY_TABS = [TAB.today, TAB.calendar, TAB.hum, TAB.settings];
const HUM_TABS = [TAB.hum, TAB.calendar, TAB.settings];

// 既定はハミングだけ。日々の記録は使いたくなったときに有効にし、いつでもやめられる(HC-8)。
// タブごとに、どのモジュールのどの画面を開くかをここで決める。モジュールはタブを知らない。
export function Shell({ store }: { store: AppStore }) {
  const [dailyEnabled, setDailyEnabled] = useState<boolean | null>(null);
  const [tab, setTab] = useState<TabId>('hum');

  useEffect(() => {
    void store.loadSettings().then((settings) => {
      const enabled = ((settings[SETTING_MODULES] as string[] | undefined) ?? []).includes('daily');
      setDailyEnabled(enabled);
      setTab(enabled ? 'today' : 'hum');
    });
  }, [store]);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      await store.setSetting(SETTING_MODULES, enabled ? ['hum', 'daily'] : ['hum']);
      setDailyEnabled(enabled);
      setTab(enabled ? 'today' : 'hum');
    },
    [store],
  );

  const onReset = useCallback(() => {
    setDailyEnabled(false);
    setTab('hum');
  }, []);

  if (dailyEnabled == null) return <div class="screen" aria-busy="true" />;

  const nav = <TabBar tabs={dailyEnabled ? DAILY_TABS : HUM_TABS} active={tab} onSelect={(id) => setTab(id as TabId)} />;

  if (dailyEnabled && tab !== 'hum') {
    return (
      <dailyModule.Root
        key={tab}
        store={store}
        nav={nav}
        entry={tab}
        onReset={onReset}
        onOpenHum={() => setTab('hum')}
        onDisable={() => setEnabled(false)}
      />
    );
  }

  const enableDaily = (
    <Group title="日々の記録" note="洗浄や症状の記録、カレンダー、受診サマリが使えます。ハミングだけに戻すこともできます。">
      <ListRow icon="layers" tone="teal" label="日々の記録も使う" onClick={() => setEnabled(true)} />
    </Group>
  );

  return (
    <humModule.Root
      key={tab}
      store={store}
      nav={nav}
      entry={tab === 'calendar' ? 'records' : tab === 'settings' ? 'settings' : 'home'}
      onReset={onReset}
      settingsExtra={enableDaily}
    />
  );
}

export function App() {
  const [store, setStore] = useState<AppStore | null>(null);
  const [error, reset] = useErrorBoundary();

  useEffect(() => {
    void openStore().then(setStore);
    void registerServiceWorker();
  }, []);

  if (error) {
    return (
      <Screen
        title="問題が発生しました"
        note={`記録は残っています。（UNEXPECTED: ${(error as Error).message}）`}
        actions={
          <Btn primary onClick={reset}>
            もう一度試す
          </Btn>
        }
      />
    );
  }
  if (!store) return <div class="screen" aria-busy="true" />;
  return <Shell store={store} />;
}
