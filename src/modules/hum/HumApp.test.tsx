import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { unmountAll } from '../../platform/testing';
import { createEvent, logicalDay } from '../../platform/events';
import { createMemoryStore } from '../../platform/store';
import { DANGER_SIGNS, NOTICE_LINES } from './copy';
import { SETTING_NOTICE } from './context';
import { SETTING_MORNING_SKIPPED } from './domain/history';
import { SETTING_POSTURE_SEEN, SETTING_PROGRAMS } from './domain/programs';
import { DEFAULT_SESSION, KIND_SESSION, SETTING_SESSION } from './domain/session';
import { KIND_PROFILE, KIND_TONE } from './domain/tones';
import { HumApp } from './HumApp';

const marked = () => Boolean((history.state as Record<string, unknown> | null)?.sinusRescueBack);

// 画面を外すと戻るの目印も外れる。次のテストに持ち越さないよう、外れるまで待つ。
afterEach(async () => {
  unmountAll();
  await waitFor(() => expect(marked()).toBe(false));
});

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

// jsdom には Web Audio がないので、タイマーで始めるのに必要な分だけ用意する。
class FakeAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  destination = {};
  private node = () => ({ connect() {}, disconnect() {} });
  private param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  createAnalyser() {
    return { ...this.node(), fftSize: 0, smoothingTimeConstant: 0, getFloatTimeDomainData() {} };
  }
  createGain() {
    return { ...this.node(), gain: this.param() };
  }
  createOscillator() {
    return { ...this.node(), frequency: this.param(), setPeriodicWave() {}, start() {}, stop() {} };
  }
  createPeriodicWave() {
    return {};
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

describe('ハミングのメニュー', () => {
  const ready = async (session?: object) => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    await store.setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
    if (session) await store.setSetting(SETTING_SESSION, { ...DEFAULT_SESSION, ...session });
    await store.addEvents([createEvent(KIND_PROFILE, { comfortHz: 139, lowHz: 98, falsettoHz: null })]);
    return store;
  };

  it('規定のメニューを選ぶと、ホームに名前と時間が出る', async () => {
    render(<HumApp store={await ready()} />);
    fireEvent.click(await screen.findByText('メニューを変える'));
    fireEvent.click(await screen.findByText('山道'));
    fireEvent.click(await screen.findByText('これにする'));
    await screen.findByText(/^山道 約\d+分$/);
  });

  it('つまむ構えを初めて使うときだけ説明を出し、合図を表示する', async () => {
    vi.stubGlobal('AudioContext', FakeAudioContext);
    try {
      const store = await ready({ programId: 'interval' });
      const first = render(<HumApp store={store} />);
      fireEvent.click(await screen.findByText('タイマーだけ使う'));
      await screen.findByText('鼻の構え');
      fireEvent.click(screen.getByText('わかりました、始める'));
      await screen.findByText('息を吸う');
      expect(screen.getByText(/次はつまむ: 鼻をつまみ、口を小さく開ける/)).toBeTruthy();
      expect((await store.loadSettings())[SETTING_POSTURE_SEEN]).toBeTruthy();
      first.unmount();

      render(<HumApp store={store} />);
      fireEvent.click(await screen.findByText('タイマーだけ使う'));
      await screen.findByText('息を吸う');
      expect(screen.queryByText('鼻の構え')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('マイクを使うときは、流れる帯と、そのセットの結果の丸を出す(D-038)', async () => {
    class MicAudioContext extends FakeAudioContext {
      createMediaStreamSource() {
        return { connect() {}, disconnect() {} };
      }
    }
    const track = { readyState: 'live', stop() {} };
    const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
    vi.stubGlobal('AudioContext', MicAudioContext);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => Promise.resolve(stream) } });
    try {
      const { container } = render(<HumApp store={await ready({ programId: 'slope' })} />);
      fireEvent.click(await screen.findByText('ハミングを始める'));
      await screen.findByText('吸いながら聞く');
      expect(container.querySelector('svg.lane')).toBeTruthy();
      expect(container.querySelector('.timebar')).toBeNull();
      const stamps = [...container.querySelectorAll('.stamp')].map((el) => el.className);
      expect(stamps).toEqual(['stamp current', ...Array(5).fill('stamp pending')]);
    } finally {
      vi.unstubAllGlobals();
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('自分のメニューを作って、そのまま使える', async () => {
    const store = await ready();
    render(<HumApp store={store} />);
    fireEvent.click(await screen.findByText('メニューを変える'));
    fireEvent.click(await screen.findByText('新しく作る'));
    fireEvent.input(await screen.findByLabelText('名前'), { target: { value: '朝用' } });
    fireEvent.click(screen.getByRole('button', { name: '軽く狭める' }));
    fireEvent.click(screen.getByRole('button', { name: '山道' }));
    fireEvent.click(screen.getByText('保存して使う'));
    await screen.findByText(/^朝用 約\d+分$/);
    const saved = (await store.loadSettings())[SETTING_PROGRAMS] as { blocks: { nose: string; pitch: { kind: string } }[] }[];
    expect(saved[0].blocks[0]).toMatchObject({ nose: 'narrow', pitch: { kind: 'hill' } });
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

describe('端末の戻る操作', () => {
  const ready = async () => {
    const store = createMemoryStore();
    await store.setSetting(SETTING_NOTICE, '2026-11-04T00:00:00Z');
    await store.setSetting(SETTING_MORNING_SKIPPED, logicalDay(new Date()));
    await store.addEvents([createEvent(KIND_PROFILE, { comfortHz: 139, lowHz: 98, falsettoHz: null })]);
    return store;
  };
  // 画面が替わって履歴の目印がそろってから押す(人の操作より速く押すと、jsdom では1回分がまとまる)。
  const pressBack = async () => {
    await waitFor(() => expect(marked()).toBe(true));
    history.back();
  };

  it('メニューの詳細から、一覧、ホームと1画面ずつ戻る', async () => {
    render(<HumApp store={await ready()} />);
    fireEvent.click(await screen.findByText('メニューを変える'));
    fireEvent.click(await screen.findByText('山道'));
    await screen.findByText('これにする');
    await pressBack();
    await screen.findByText('規定のメニュー');
    await pressBack();
    await screen.findByText('今日のハミング');
  });

  it('削除の確認で戻ると、削除せずに設定へ戻る', async () => {
    const store = await ready();
    render(<HumApp store={store} entry="settings" />);
    fireEvent.click(await screen.findByText('すべてのデータを削除する'));
    await screen.findByText('すべてのデータを削除しますか');
    await pressBack();
    await screen.findByText('すべてのデータを削除する');
    expect(await store.loadEvents()).toHaveLength(1);
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
