import 'fake-indexeddb/auto';
import { createBackup, newEventsFrom, parseBackup, restorableSettings } from './backup';
import { addMonths, monthGrid, monthLabel } from './calendar';
import { addDays, createEvent, dayDiff, latestOn, localIso, logicalDay, longDayLabel } from './events';
import { createMemoryStore, openStore } from './store';

describe('logicalDay', () => {
  it('午前4時を1日の区切りにする', () => {
    expect(logicalDay(new Date('2026-11-04T03:59:00'))).toBe('2026-11-03');
    expect(logicalDay(new Date('2026-11-04T04:00:00'))).toBe('2026-11-04');
  });

  it('月初をまたいでも正しい', () => {
    expect(logicalDay(new Date('2026-12-01T01:00:00'))).toBe('2026-11-30');
  });
});

it('日付を足し引きする', () => {
  expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
  expect(addDays('2026-11-01', -1)).toBe('2026-10-31');
});

it('時差付きの ISO 8601 を返す', () => {
  expect(localIso(new Date('2026-11-04T10:00:00'))).toMatch(/^2026-11-04T10:00:00\.000[+-]\d{2}:\d{2}$/);
});

it('イベントは一意の ID と論理日を持つ', () => {
  const a = createEvent('x', {}, new Date('2026-11-04T03:00:00'));
  const b = createEvent('x', {});
  expect(a.id).not.toBe(b.id);
  expect(a.day).toBe('2026-11-03');
  expect(a.source).toBe('live');
});

it('過去の日を指定すると、遡った記録の印が付く', () => {
  const now = new Date('2026-11-04T10:00:00');
  expect(createEvent('x', {}, now, { day: '2026-11-02' })).toMatchObject({ day: '2026-11-02', source: 'backfill' });
  expect(createEvent('x', {}, now, { day: '2026-11-04' }).source).toBe('live');
  expect(createEvent('x', {}, now, { source: 'same_as_yesterday' }).source).toBe('same_as_yesterday');
});

it('同じ日の記録は最後のものを今の値にする', () => {
  const events = [createEvent('x', 1, new Date('2026-11-04T10:00:00')), createEvent('x', 2, new Date('2026-11-04T11:00:00'))];
  expect(latestOn(events, 'x', '2026-11-04')).toBe(2);
  expect(latestOn(events, 'x', '2026-11-05')).toBeNull();
});

it('論理日どうしの差を暦の日数で返す', () => {
  expect(dayDiff('2026-10-30', '2026-11-02')).toBe(3);
  expect(dayDiff('2026-11-02', '2026-11-02')).toBe(0);
});

it('バックアップの設定は、手元にない項目だけ復元する', () => {
  const restored = restorableSettings({ a: 1 }, { a: 2, b: 3, 'shell.modules': ['hum', 'daily'] });
  expect(restored).toEqual({ b: 3 });
  expect(restorableSettings({}, undefined)).toEqual({});
});

describe.each([
  ['IndexedDB', () => openStore(`test-${crypto.randomUUID()}`)],
  ['メモリ', async () => createMemoryStore()],
])('保存層 (%s)', (_, open) => {
  it('イベントを時刻順に保存して読み出す', async () => {
    const store = await open();
    const later = createEvent('a', 1, new Date('2026-11-04T12:00:00'));
    const earlier = createEvent('b', 2, new Date('2026-11-04T08:00:00'));
    await store.addEvents([later, earlier]);
    expect((await store.loadEvents()).map((e) => e.kind)).toEqual(['b', 'a']);
  });

  it('設定を保存して読み出す', async () => {
    const store = await open();
    await store.setSetting('k', { v: 1 });
    expect(await store.loadSettings()).toEqual({ k: { v: 1 } });
  });

  it('すべて削除できる', async () => {
    const store = await open();
    await store.addEvents([createEvent('a', 1)]);
    await store.setSetting('k', 1);
    await store.clear();
    expect(await store.loadEvents()).toEqual([]);
    expect(await store.loadSettings()).toEqual({});
  });
});

it('IndexedDB の保存層は永続、メモリは非永続と判別できる', async () => {
  expect((await openStore(`test-${crypto.randomUUID()}`)).persistent).toBe(true);
  expect(createMemoryStore().persistent).toBe(false);
});

describe('バックアップ', () => {
  const events = [createEvent('a', 1), createEvent('b', 2)];

  it('書き出したものを読み戻せる', () => {
    const parsed = parseBackup(JSON.stringify(createBackup(events, { k: 1 })));
    expect(parsed.ok && parsed.backup.events).toHaveLength(2);
  });

  it.each([
    ['JSONでない', 'not json'],
    ['形式が違う', '{"format":"other","version":1,"events":[]}'],
    ['版が違う', '{"format":"sinus-rescue-backup","version":99,"events":[]}'],
    ['記録が壊れている', '{"format":"sinus-rescue-backup","version":1,"events":[{"foo":1}]}'],
  ])('%sファイルは理由コードで拒否する', (_, text) => {
    expect(parseBackup(text)).toEqual({ ok: false, code: 'BACKUP_INVALID' });
  });

  it('すでにある記録は上書きせず、新しいものに読み込み元の印を付ける', () => {
    const incoming = [events[0], createEvent('c', 3)];
    const added = newEventsFrom(events, incoming);
    expect(added.map((e) => e.kind)).toEqual(['c']);
    expect(added[0].source).toBe('import');
  });
});

describe('カレンダー', () => {
  it('日曜始まりで月の外を空ける', () => {
    const weeks = monthGrid('2026-11');
    expect(weeks[0][0]).toBe('2026-11-01');
    expect(weeks.at(-1)?.filter(Boolean).at(-1)).toBe('2026-11-30');
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    const february = monthGrid('2026-02');
    expect(february[0].indexOf('2026-02-01')).toBe(0);
    expect(february.flat().filter(Boolean)).toHaveLength(28);
    expect(monthGrid('2026-12')[0].slice(0, 2)).toEqual([null, null]);
  });

  it('年をまたいで月を移る', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(monthLabel('2027-01')).toBe('2027年1月');
  });

  it('見出しの日付は曜日を付ける', () => {
    expect(longDayLabel('2026-11-06')).toBe('11月6日(金)');
  });
});
