import { useState } from 'preact/hooks';
import { saveTextFile } from '../../../platform/backup';
import { Btn, Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import { buildIcs, DEFAULT_REMINDERS, REMINDER_LABELS, SETTING_REMINDERS, type Reminder } from '../domain/ics';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function Reminders() {
  const { settings, setSetting, go } = useDaily();
  const [message, setMessage] = useState('');
  const reminders = (settings[SETTING_REMINDERS] as Reminder[] | undefined) ?? DEFAULT_REMINDERS;

  const update = (id: string, change: Partial<Reminder>) =>
    setSetting(SETTING_REMINDERS, reminders.map((r) => (r.id === id ? { ...r, ...change } : r)));

  const toggleDay = (reminder: Reminder, day: number) =>
    update(reminder.id, {
      days: reminder.days.includes(day) ? reminder.days.filter((d) => d !== day) : [...reminder.days, day],
    });

  const exportIcs = async () => {
    const result = await saveTextFile('sinus-rescue-reminders.ics', buildIcs(reminders), 'text/calendar');
    if (result !== 'cancelled') setMessage('書き出しました。ファイルを開くと、カレンダーに追加できます。');
  };

  return (
    <Screen
      title="リマインダー"
      note="カレンダーの予定として書き出し、カレンダーの通知を使います。済んでいても通知は止まりません。"
      align="top"
      onClose={() => go({ name: 'settings' })}
      closeLabel="戻る"
      actions={<Btn onClick={exportIcs}>カレンダー用に書き出す</Btn>}
    >
      <ul class="edit-list">
        {reminders.map((reminder) => (
          <li key={reminder.id}>
            <div class="setting-row bare">
              <button
                type="button"
                class={`chip ${reminder.enabled ? 'chip-active' : ''}`}
                aria-pressed={reminder.enabled}
                onClick={() => update(reminder.id, { enabled: !reminder.enabled })}
              >
                {REMINDER_LABELS[reminder.id]}
              </button>
              <input
                type="time"
                aria-label={`${REMINDER_LABELS[reminder.id]}の時刻`}
                value={reminder.time}
                onChange={(e) => update(reminder.id, { time: (e.currentTarget as HTMLInputElement).value })}
              />
            </div>
            {reminder.enabled && (
              <div class="weekdays">
                {WEEKDAYS.map((label, day) => (
                  <button
                    type="button"
                    key={label}
                    class={`chip ${reminder.days.includes(day) ? 'chip-active' : ''}`}
                    aria-pressed={reminder.days.includes(day)}
                    onClick={() => toggleDay(reminder, day)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <p class="note" role="status">
          {message}
        </p>
      )}
    </Screen>
  );
}
