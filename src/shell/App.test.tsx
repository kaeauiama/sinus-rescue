import { fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { unmountAll } from '../platform/testing';
import { createMemoryStore } from '../platform/store';
import { SETTING_NOTICE } from '../modules/hum/context';
import { SETTING_MODULES, Shell } from './App';

afterEach(unmountAll);

async function humOnlyStore() {
  const store = createMemoryStore();
  await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
  return store;
}

describe('モジュールの切り替え(HC-8)', () => {
  it('既定はハミングだけで、今日のタブを出さない', async () => {
    render(<Shell store={await humOnlyStore()} />);
    await screen.findByText('声の高さを測る');
    const nav = screen.getByRole('navigation', { name: 'メニュー' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['ハミング', 'カレンダー', '設定']);
    fireEvent.click(within(nav).getByText('設定'));
    await screen.findByText('日々の記録も使う');
  });

  it('日々の記録を有効にすると、次の起動でも今日の画面から始まる', async () => {
    const store = await humOnlyStore();
    const first = render(<Shell store={store} />);
    fireEvent.click(await screen.findByText('設定'));
    fireEvent.click(await screen.findByText('日々の記録も使う'));
    fireEvent.click(await screen.findByText('始める'));
    await screen.findByText('今日の症状を記録する');
    expect((await store.loadSettings())[SETTING_MODULES]).toEqual(['hum', 'daily']);
    first.unmount();

    render(<Shell store={store} />);
    await screen.findByText('今日の症状を記録する');
    const nav = screen.getByRole('navigation', { name: 'メニュー' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['今日', 'カレンダー', 'ハミング', '設定']);
    fireEvent.click(within(nav).getByText('ハミング'));
    await screen.findByText('声の高さを測る');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByText('カレンダー'));
    await screen.findByText('グラフ');
  });

  it('ハミングだけに戻しても、記録は残る', async () => {
    const store = await humOnlyStore();
    render(<Shell store={store} />);
    fireEvent.click(await screen.findByText('設定'));
    fireEvent.click(await screen.findByText('日々の記録も使う'));
    fireEvent.click(await screen.findByText('始める'));
    fireEvent.click((await screen.findAllByRole('checkbox', { name: '洗浄' }))[0]);
    await waitFor(async () => expect(await store.loadEvents()).toHaveLength(1));
    fireEvent.click(within(screen.getByRole('navigation', { name: 'メニュー' })).getByText('設定'));
    fireEvent.click(await screen.findByText('ハミングだけにする'));
    await screen.findByText('声の高さを測る');
    expect(within(screen.getByRole('navigation', { name: 'メニュー' })).queryByText('今日')).toBeNull();
    expect(await store.loadEvents()).toHaveLength(1);
  });

  it('すべて削除すると、ハミングだけの初回に戻る', async () => {
    const store = await humOnlyStore();
    await store.setSetting(SETTING_MODULES, ['hum', 'daily']);
    render(<Shell store={store} />);
    fireEvent.click(await screen.findByText('始める'));
    fireEvent.click(await screen.findByText('設定'));
    fireEvent.click(await screen.findByText('すべてのデータを削除する'));
    fireEvent.click(await screen.findByText('削除する'));
    await screen.findByText('はじめに');
    expect(await store.loadSettings()).toEqual({});
  });
});
