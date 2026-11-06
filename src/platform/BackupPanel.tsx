import { useState } from 'preact/hooks';
import {
  BACKUP_NAG_DAYS,
  createBackup,
  newEventsFrom,
  parseBackup,
  restorableSettings,
  saveTextFile,
  SETTING_LAST_BACKUP,
} from './backup';
import { daysBetween, logicalDay, type LogEvent } from './events';
import { Icon } from './icons';
import type { Settings } from './store';
import { Group, IconChip, ListRow } from './ui';

interface BackupPanelProps {
  events: LogEvent[];
  settings: Settings;
  persistent: boolean;
  appendAll: (events: LogEvent[]) => Promise<void>;
  setSetting: (key: string, value: unknown) => Promise<void>;
}

// 書き出しと読み込みはモジュールをまたいで1種類だけ持つ。ファイルにはすべての記録が入る。
export function BackupPanel({ events, settings, persistent, appendAll, setSetting }: BackupPanelProps) {
  const [message, setMessage] = useState('');
  const lastBackup = settings[SETTING_LAST_BACKUP] as string | undefined;
  const backupAge = lastBackup ? daysBetween(lastBackup, new Date()) : null;

  const exportData = async () => {
    const text = JSON.stringify(createBackup(events, settings), null, 2);
    const result = await saveTextFile(`sinus-rescue-${logicalDay(new Date())}.json`, text);
    if (result !== 'cancelled') {
      await setSetting(SETTING_LAST_BACKUP, new Date().toISOString());
      setMessage('書き出しました。');
    }
  };

  const importData = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) {
      setMessage(`読み込めないファイルです（${parsed.code}）`);
      return;
    }
    const added = newEventsFrom(events, parsed.backup.events);
    await appendAll(added);
    for (const [key, value] of Object.entries(restorableSettings(settings, parsed.backup.settings))) {
      await setSetting(key, value);
    }
    setMessage(`${added.length}件の記録を読み込みました。`);
  };

  const status = [
    persistent ? 'データはこの端末の中だけにあります。' : 'この環境では保存できません。閉じると記録は消えます。（STORAGE_UNAVAILABLE）',
    backupAge == null ? 'まだ書き出していません。' : `最後の書き出しは${backupAge}日前です。`,
    backupAge != null && backupAge >= BACKUP_NAG_DAYS ? 'そろそろ書き出すと安心です。' : '',
  ].join('');

  return (
    <Group
      title="データ"
      note={
        <>
          {status}
          {message && (
            <span class="status" role="status">
              {message}
            </span>
          )}
        </>
      }
    >
      <ListRow icon="download" tone="teal" label="書き出す" onClick={exportData} />
      <label class="list-row">
        <IconChip icon="upload" tone="teal" />
        <span class="list-main">
          <span>読み込む</span>
        </span>
        <span class="list-chevron">
          <Icon name="chevronRight" size={18} />
        </span>
        <input class="visually-hidden" type="file" accept="application/json,.json" onChange={importData} />
      </label>
    </Group>
  );
}
