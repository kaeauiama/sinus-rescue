import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { addDays, createEvent, logicalDay } from '../../platform/events';
import { createMemoryStore } from '../../platform/store';
import { SETTING_MORNING_SKIPPED } from '../hum/domain/history';
import { SETTING_DAILY_NOTICE, SETTING_HIDE_CHART } from './context';
import { SETTING_STARTED } from './domain/routine';
import { KIND_SYMPTOM, SYMPTOMS } from './domain/symptoms';
import { DAILY_NOTICE_LINES } from './copy';
import { DailyApp } from './DailyApp';

afterEach(cleanup);

async function openedStore() {
  const store = createMemoryStore();
  await store.setSetting(SETTING_DAILY_NOTICE, '2026-11-04T00:00:00Z');
  await store.setSetting(SETTING_STARTED, logicalDay(new Date()));
  // 実行する時刻によって朝の質問が割り込まないようにする。
  await store.setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
  return store;
}

it('初回だけ説明を出し、確認すると今日の画面を開く', async () => {
  const store = createMemoryStore();
  render(<DailyApp store={store} />);
  await screen.findByText(DAILY_NOTICE_LINES[0]);
  fireEvent.click(screen.getByText('始める'));
  await screen.findByText('今日の症状を記録する');
  expect(screen.queryByText(DAILY_NOTICE_LINES[0])).toBeNull();
  expect((await store.loadSettings())[SETTING_STARTED]).toBe(logicalDay(new Date()));
});

it('チェックは1タップで記録し、もう一度押すと取り消せる', async () => {
  const store = await openedStore();
  render(<DailyApp store={store} />);
  const [box] = await screen.findAllByRole('checkbox', { name: '洗浄' });
  fireEvent.click(box);
  await screen.findByText('洗浄液の戻りは(任意)');
  fireEvent.click(screen.getByText('透明'));
  await waitFor(() => expect(screen.queryByText('洗浄液の戻りは(任意)')).toBeNull());
  expect((await store.loadEvents()).at(-1)?.payload).toMatchObject({ itemId: 'rinse-morning', done: true, rinseReturn: 'clear' });
  fireEvent.click(screen.getAllByRole('checkbox', { name: '洗浄' })[0]);
  await waitFor(async () => expect((await store.loadEvents()).at(-1)?.payload).toMatchObject({ done: false }));
});

it('症状は1問ずつ答え、左右を聞いたうえで保存する', async () => {
  const store = await openedStore();
  render(<DailyApp store={store} />);
  fireEvent.click(await screen.findByText('今日の症状を記録する'));
  await screen.findByText(SYMPTOMS[0].question);
  fireEvent.click(screen.getByText('5'));
  await screen.findByText('どちら側ですか');
  fireEvent.click(screen.getByText('左'));
  await screen.findByText(SYMPTOMS[1].question);
  for (const symptom of SYMPTOMS.slice(1)) {
    await screen.findByText(symptom.question);
    fireEvent.click(screen.getByText('1'));
  }
  await screen.findByText('今日あったことは');
  const saved = (await store.loadEvents()).find((e) => e.kind === KIND_SYMPTOM);
  expect(saved?.payload).toMatchObject({ scores: { congestion: 5, stress: 1 }, sides: { congestion: 'left' } });
  fireEvent.click(screen.getByText('記録する'));
  await screen.findByText(/総合 1.8/);
});

it('全部昨日と同じは1タップで記録し、印を残す', async () => {
  const store = await openedStore();
  const yesterday = addDays(logicalDay(new Date()), -1);
  await store.addEvents([createEvent(KIND_SYMPTOM, { scores: { congestion: 2, drip: 2, smellLoss: 2, heaviness: 2, odor: 2 }, sides: {} }, new Date(), { day: yesterday })]);
  render(<DailyApp store={store} />);
  fireEvent.click(await screen.findByText('今日の症状を記録する'));
  fireEvent.click(await screen.findByText('全部昨日と同じ'));
  await screen.findByText('総合 2');
  expect((await store.loadEvents()).at(-1)).toMatchObject({ source: 'same_as_yesterday', day: logicalDay(new Date()) });
});

it('前の日に移って入力すると、遡った記録の印が付く', async () => {
  const store = await openedStore();
  render(<DailyApp store={store} />);
  fireEvent.click(await screen.findByLabelText('前の日'));
  await screen.findByText('遡って記録します。');
  fireEvent.click(screen.getAllByRole('checkbox', { name: '洗浄' })[0]);
  await waitFor(async () => expect((await store.loadEvents()).at(-1)).toMatchObject({ source: 'backfill', day: addDays(logicalDay(new Date()), -1) }));
});

it('血管収縮薬を追加しても継続の対象にはならない(HC-4)', async () => {
  const store = await openedStore();
  render(<DailyApp store={store} />);
  fireEvent.click(await screen.findByText('薬と受診'));
  fireEvent.click(await screen.findByText('使い始めた薬を記録する'));
  fireEvent.click(await screen.findByText('血管収縮点鼻'));
  fireEvent.click(screen.getByText('記録する'));
  await screen.findByText(/使用中/);
  fireEvent.click(screen.getByText('戻る'));
  fireEvent.click(await screen.findByRole('checkbox', { name: '血管収縮点鼻' }));
  await screen.findByText('連続1日目');
  expect(screen.getByText('継続').parentElement?.textContent).toBe('継続0日');
});

it('相談の目安に当てはまると静かに案内し、確認すると消える(HC-3)', async () => {
  const store = await openedStore();
  await store.addEvents([createEvent('routine', { itemId: 'r', itemType: 'rinse', done: true, rinseReturn: 'blood' })]);
  render(<DailyApp store={store} />);
  fireEvent.click(await screen.findByText('相談の目安に当てはまる記録があります'));
  await screen.findByText(/BLOOD/);
  fireEvent.click(screen.getByText('確認しました'));
  await screen.findByText('今日の症状を記録する');
  expect(screen.queryByText('相談の目安に当てはまる記録があります')).toBeNull();
});

it('カレンダーは記録がなくても開け、グラフに切り替えられる', async () => {
  const store = await openedStore();
  render(<DailyApp store={store} entry="calendar" />);
  await screen.findByText('この日の記録はありません。');
  fireEvent.click(screen.getByText('グラフ'));
  await screen.findByRole('img', { name: /総合の28日間の推移/ });
});

it('カレンダーはケアを終えた日に印を付け、その日の記録を開ける', async () => {
  const store = await openedStore();
  await store.addEvents([
    createEvent('routine', { itemId: 'rinse-morning', itemType: 'rinse', done: true }),
    createEvent('routine', { itemId: 'rinse-night', itemType: 'rinse', done: true }),
    createEvent('hum_session', { mode: 'tuner', durationSec: 180, completed: true, tones: [] }),
  ]);
  render(<DailyApp store={store} entry="calendar" />);
  await screen.findByRole('button', { name: /今日 ケア完了/ });
  fireEvent.click(screen.getByText('今日の記録を開く'));
  await screen.findByText('今日の症状を記録する');
  fireEvent.click(screen.getByText('戻る'));
  await screen.findByText('今日の記録を開く');
});

it('受診サマリに記録の集計が出る', async () => {
  const store = await openedStore();
  render(<DailyApp store={store} />);
  fireEvent.click(await screen.findByText('薬と受診'));
  fireEvent.click(await screen.findByText('経過を1枚にまとめる'));
  await screen.findByText('本人による記録の集計です。');
  expect(screen.getByText('項目別の平均')).toBeTruthy();
});

it('グラフを隠す設定にすると、経過にグラフを出さない', async () => {
  const store = await openedStore();
  const settings = render(<DailyApp store={store} entry="settings" />);
  fireEvent.click(await screen.findByRole('switch', { name: /経過のグラフを隠す/ }));
  await waitFor(async () => expect(await store.loadSettings()).toMatchObject({ [SETTING_HIDE_CHART]: true }));
  settings.unmount();
  render(<DailyApp store={store} entry="calendar" />);
  fireEvent.click(await screen.findByText('グラフ'));
  await screen.findByText(/グラフは隠しています/);
  expect(screen.queryByRole('img')).toBeNull();
});

it('前日に使っていれば、朝に鼻の通りと眠りを聞く。同じ質問はハミング側の記録に入れる', async () => {
  vi.useFakeTimers({ now: new Date('2026-11-04T08:00:00'), toFake: ['Date'] });
  try {
    const store = createMemoryStore();
    await store.setSetting(SETTING_DAILY_NOTICE, '2026-11-03T00:00:00Z');
    await store.setSetting(SETTING_STARTED, '2026-11-03');
    await store.addEvents([createEvent('routine', { itemId: 'x', itemType: 'other', done: true }, new Date('2026-11-03T20:00:00'))]);
    render(<DailyApp store={store} />);
    await screen.findByText('今朝の鼻の通りは');
    fireEvent.click(screen.getByText('7'));
    await screen.findByText('昨夜の眠りは');
    fireEvent.click(screen.getByText('6'));
    await screen.findByText('何時間くらい眠りましたか');
    fireEvent.click(screen.getByText('7時間'));
    await screen.findByText('今日の症状を記録する');
    const events = await store.loadEvents();
    expect(events.find((e) => e.kind === 'hum_morning')?.payload).toEqual({ score: 7 });
    expect(events.find((e) => e.kind === 'sleep')?.payload).toEqual({ satisfaction: 6, hours: 7 });
  } finally {
    vi.useRealTimers();
  }
});

it('通信なしで動く(HC-5)', async () => {
  const fetchSpy = vi.fn(() => Promise.reject(new Error('network must not be used')));
  vi.stubGlobal('fetch', fetchSpy);
  try {
    render(<DailyApp store={await openedStore()} />);
    await screen.findByText('今日の症状を記録する');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
