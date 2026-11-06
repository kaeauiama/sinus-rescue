export const SETTING_REMINDERS = 'daily.reminders';

export type ReminderId = 'morning' | 'night' | 'hum' | 'symptom';

export interface Reminder {
  id: ReminderId;
  enabled: boolean;
  time: string;
  days: number[];
}

// 本文には一般的な文言だけを入れ、症状の内容を含めない(REQ-21)。
export const REMINDER_LABELS: Record<ReminderId, string> = {
  morning: '朝のケア',
  night: '夜のケア',
  hum: 'ハミング',
  symptom: '今日の記録',
};

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const DEFAULT_REMINDERS: Reminder[] = [
  { id: 'morning', enabled: true, time: '07:30', days: EVERY_DAY },
  { id: 'night', enabled: true, time: '21:30', days: EVERY_DAY },
  { id: 'hum', enabled: false, time: '21:00', days: EVERY_DAY },
  { id: 'symptom', enabled: true, time: '21:15', days: EVERY_DAY },
];

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const pad = (n: number) => String(n).padStart(2, '0');

function stamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

// 次にその曜日が来る日を、繰り返しの開始日にする。
function firstDate(days: number[], now: Date): Date {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (!days.includes(date.getDay())) date.setDate(date.getDate() + 1);
  return date;
}

// PWA単体で定時通知を出す確実な手段がないので、カレンダーの通知を代わりに使う(REQ-23)。
export function buildIcs(reminders: Reminder[], now: Date = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//sinus-rescue//reminders//JA', 'CALSCALE:GREGORIAN'];
  for (const reminder of reminders) {
    if (!reminder.enabled || !reminder.days.length) continue;
    const start = firstDate(reminder.days, now);
    const date = `${start.getFullYear()}${pad(start.getMonth() + 1)}${pad(start.getDate())}`;
    const time = `${reminder.time.replace(':', '')}00`;
    const byDay = [...reminder.days].sort().map((d) => WEEKDAY_CODES[d]).join(',');
    lines.push(
      'BEGIN:VEVENT',
      `UID:sinus-rescue-${reminder.id}@reminders.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${date}T${time}`,
      'DURATION:PT5M',
      `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`,
      `SUMMARY:${REMINDER_LABELS[reminder.id]}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${REMINDER_LABELS[reminder.id]}`,
      'TRIGGER:PT0M',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}
