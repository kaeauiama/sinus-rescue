import { useState } from 'preact/hooks';
import { saveTextFile } from '../../../platform/backup';
import { logicalDay } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import { APP_NAME } from '../../hum/copy';
import { useDaily } from '../context';
import { summaryText, visitSummary } from '../domain/summary';

export function Summary() {
  const { events, items, startedDay, go } = useDaily();
  const [message, setMessage] = useState('');
  const today = logicalDay(new Date());
  const sections = visitSummary(events, items, today, startedDay);

  const share = async () => {
    const text = summaryText(`${APP_NAME} 受診サマリ`, sections);
    const result = await saveTextFile(`sinus-rescue-summary-${today}.txt`, text, 'text/plain');
    if (result !== 'cancelled') setMessage('書き出しました。');
  };

  return (
    <Screen
      title="受診サマリ"
      note="本人による記録の集計です。"
      align="top"
      onClose={() => go({ name: 'meds' })}
      actions={<Btn onClick={share}>テキストで書き出す</Btn>}
    >
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <ul class="plain tight">
            {section.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ))}
      {message && (
        <p class="note" role="status">
          {message}
        </p>
      )}
    </Screen>
  );
}
