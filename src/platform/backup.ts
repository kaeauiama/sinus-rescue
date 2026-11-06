import type { LogEvent } from './events';
import { localIso } from './events';
import type { Settings } from './store';

const FORMAT = 'sinus-rescue-backup';
const VERSION = 1;

// 最初のモジュールで使い始めた名前なので、記録を引き継ぐためそのまま残す。
export const SETTING_LAST_BACKUP = 'hum.lastBackupAt';
export const BACKUP_NAG_DAYS = 7;

export interface Backup {
  format: string;
  version: number;
  exportedAt: string;
  events: LogEvent[];
  settings: Settings;
}

export type ParsedBackup = { ok: true; backup: Backup } | { ok: false; code: 'BACKUP_INVALID' };

export function createBackup(events: LogEvent[], settings: Settings, now: Date = new Date()): Backup {
  return { format: FORMAT, version: VERSION, exportedAt: localIso(now), events, settings };
}

export function parseBackup(text: string): ParsedBackup {
  try {
    const data = JSON.parse(text);
    const valid =
      data?.format === FORMAT &&
      data.version === VERSION &&
      Array.isArray(data.events) &&
      data.events.every((e: LogEvent) => typeof e?.id === 'string' && typeof e?.kind === 'string' && typeof e?.ts === 'string');
    return valid ? { ok: true, backup: data } : { ok: false, code: 'BACKUP_INVALID' };
  } catch {
    return { ok: false, code: 'BACKUP_INVALID' };
  }
}

// すでに持っている記録は上書きせず、新しいものだけを読み込み元の印を付けて返す。
export function newEventsFrom(existing: LogEvent[], incoming: LogEvent[]): LogEvent[] {
  const known = new Set(existing.map((e) => e.id));
  return incoming.filter((e) => !known.has(e.id)).map((e) => ({ ...e, source: 'import' as const }));
}

// 手元の設定を優先し、ない項目だけを復元する。モジュールの有効状態は端末ごとに選び直す。
export function restorableSettings(current: Settings, incoming: Settings | undefined): Settings {
  return Object.fromEntries(
    Object.entries(incoming ?? {}).filter(([key]) => !(key in current) && !key.startsWith('shell.')),
  );
}

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export async function saveTextFile(name: string, text: string, type = 'application/json'): Promise<SaveResult> {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if ((error as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
