import type { LogEvent } from './events';

// github.io では同じオリジンに他のサイトが同居するので、DB名に固有の接頭辞を付ける。
const DB_NAME = 'sinus-rescue';
const DB_VERSION = 1;
const EVENTS = 'events';
const SETTINGS = 'settings';

export type Settings = Record<string, unknown>;

export interface AppStore {
  readonly persistent: boolean;
  loadEvents(): Promise<LogEvent[]>;
  addEvents(events: LogEvent[]): Promise<void>;
  loadSettings(): Promise<Settings>;
  setSetting(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
}

// 記号の順序が言語設定に左右されないよう、文字コードで比べる。
const byTimestamp = (a: LogEvent, b: LogEvent) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0);

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function completed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(EVENTS, { keyPath: 'id' });
      req.result.createObjectStore(SETTINGS, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function createIndexedStore(db: IDBDatabase): AppStore {
  return {
    persistent: true,
    async loadEvents() {
      const events = await request(db.transaction(EVENTS).objectStore(EVENTS).getAll());
      return (events as LogEvent[]).sort(byTimestamp);
    },
    async addEvents(events) {
      const tx = db.transaction(EVENTS, 'readwrite');
      for (const event of events) tx.objectStore(EVENTS).put(event);
      await completed(tx);
    },
    async loadSettings() {
      const rows = await request(db.transaction(SETTINGS).objectStore(SETTINGS).getAll());
      return Object.fromEntries((rows as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
    },
    async setSetting(key, value) {
      const tx = db.transaction(SETTINGS, 'readwrite');
      tx.objectStore(SETTINGS).put({ key, value });
      await completed(tx);
    },
    async clear() {
      const tx = db.transaction([EVENTS, SETTINGS], 'readwrite');
      tx.objectStore(EVENTS).clear();
      tx.objectStore(SETTINGS).clear();
      await completed(tx);
    },
  };
}

export function createMemoryStore(): AppStore {
  let events: LogEvent[] = [];
  let settings: Settings = {};
  return {
    persistent: false,
    loadEvents: async () => [...events].sort(byTimestamp),
    addEvents: async (added) => {
      const ids = new Set(added.map((e) => e.id));
      events = [...events.filter((e) => !ids.has(e.id)), ...added];
    },
    loadSettings: async () => ({ ...settings }),
    setSetting: async (key, value) => {
      settings = { ...settings, [key]: value };
    },
    clear: async () => {
      events = [];
      settings = {};
    },
  };
}

// 保存できない環境でも使えるよう、失敗したらメモリに切り替える。persistent で画面から判別できる。
export async function openStore(name: string = DB_NAME): Promise<AppStore> {
  try {
    return createIndexedStore(await openDatabase(name));
  } catch {
    return createMemoryStore();
  }
}
