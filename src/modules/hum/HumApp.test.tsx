import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { createEvent, logicalDay } from '../../platform/events';
import { createMemoryStore } from '../../platform/store';
import { DANGER_SIGNS, NOTICE_LINES } from './copy';
import { SETTING_NOTICE } from './context';
import { SETTING_MORNING_SKIPPED } from './domain/history';
import { KIND_SESSION } from './domain/session';
import { KIND_PROFILE, KIND_TONE } from './domain/tones';
import { HumApp } from './HumApp';

afterEach(cleanup);

describe('初回の注意書き(HC-3)', () => {
  it('初回は全員に表示する', async () => {
    render(<HumApp store={createMemoryStore()} />);
    await screen.findByText('はじめに');
    for (const line of [...NOTICE_LINES, ...DANGER_SIGNS]) expect(screen.getByText(line)).toBeTruthy();
  });

  it('一度確認すると、次の起動では表示しない', async () => {
    const store = createMemoryStore();
    const first = render(<HumApp store={store} />);
    fireEvent.click(await screen.findByText('わかりました'));
    await waitFor(() => expect(screen.queryByText('はじめに')).toBeNull());
    first.unmount();

    render(<HumApp store={store} />);
    await screen.findByText('声の高さを測る');
    expect(screen.queryByText('はじめに')).toBeNull();
  });

  it('確認したあとも、設定の情報ページで読める', async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    render(<HumApp store={store} entry="settings" />);
    fireEvent.click(await screen.findByText('情報'));
    await screen.findByText(NOTICE_LINES[1]);
    expect(screen.getByText(DANGER_SIGNS[0])).toBeTruthy();
  });
});

describe('単体での動作(HC-8)', () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error('network must not be used')));

  beforeEach(() => {
    fetchSpy.mockClear();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('通信なし、保存はメモリだけでもホームが開く', async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    await store.addEvents([createEvent(KIND_PROFILE, { comfortHz: 139, lowHz: 98, falsettoHz: null })]);
    render(<HumApp store={store} />);
    await screen.findByText('今日のハミング');
    expect(screen.getByText(/楽な高さの音で始めます/)).toBeTruthy();
    expect(screen.getByText('タイマーだけ使う')).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('比較実験', () => {
  const started = async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    await store.setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
    await store.addEvents([
      createEvent(KIND_PROFILE, { comfortHz: 139, lowHz: 98, falsettoHz: null }),
      createEvent(KIND_TONE, { toneId: 't', site: 'forehead', hz: 330, measuredHz: 330, levelDb: -40, strength: 3, clearness: 2, method: 'self' }),
    ]);
    return store;
  };

  it('始めると今日の条件を案内し、やめると元に戻る', async () => {
    const store = await started();
    render(<HumApp store={store} />);
    fireEvent.click(await screen.findByText('比べる'));
    fireEvent.click(await screen.findByText('始める'));
    await screen.findByText(/^今日は(登録した音|楽な高さの音)$/);
    fireEvent.click(screen.getByText('戻る'));
    await screen.findByText(/比較中: 今日は/);
    fireEvent.click(screen.getByText(/比較中: 今日は/));
    fireEvent.click(await screen.findByText('比較をやめる'));
    fireEvent.click(await screen.findByText('やめる'));
    await screen.findByText('2つの音を比べる');
  });

  it('登録した音がなければ始められない', async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    await store.setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
    await store.addEvents([createEvent(KIND_PROFILE, { comfortHz: 139, lowHz: 98, falsettoHz: null })]);
    render(<HumApp store={store} />);
    fireEvent.click(await screen.findByText('比べる'));
    await screen.findByText(/先に響く音を1つ登録/);
    expect(screen.queryByText('始める')).toBeNull();
  });
});

describe('タブから開く画面', () => {
  it('カレンダーは1分以上続けた日に印を付け、選んだ日の記録を出す', async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    await store.addEvents([createEvent(KIND_SESSION, { mode: 'tuner', durationSec: 180, completed: true, tones: [] })]);
    render(<HumApp store={store} entry="records" />);
    await screen.findByRole('button', { name: /今日 ハミングあり/ });
    expect(screen.getByText('3分')).toBeTruthy();
  });

  it('設定には外から渡した項目と、全削除を置く', async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    render(<HumApp store={store} entry="settings" settingsExtra={<p>外から渡した項目</p>} />);
    await screen.findByText('外から渡した項目');
    fireEvent.click(screen.getByText('すべてのデータを削除する'));
    fireEvent.click(await screen.findByText('削除する'));
    await screen.findByText('はじめに');
    expect(await store.loadEvents()).toHaveLength(0);
  });
});

it('前日に使っていれば、午前中に今朝の鼻の通りを聞く', async () => {
  vi.useFakeTimers({ now: new Date('2026-11-04T08:00:00'), toFake: ['Date'] });
  try {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-03T00:00:00Z');
    await store.addEvents([createEvent(KIND_PROFILE, { comfortHz: 139, lowHz: 98, falsettoHz: null }, new Date('2026-11-03T20:00:00'))]);
    render(<HumApp store={store} />);
    await screen.findByText('今朝の鼻の通りは');
    fireEvent.click(screen.getByText('7'));
    await screen.findByText('今日のハミング');
    const events = await store.loadEvents();
    expect(events.at(-1)).toMatchObject({ kind: 'hum_morning', payload: { score: 7 } });
  } finally {
    vi.useRealTimers();
  }
});
