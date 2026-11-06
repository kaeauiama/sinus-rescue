import { logicalDay } from '../../../platform/events';
import { Btn, Screen } from '../../../platform/ui';
import { CONSULT_SIGNS, CONSULT_TITLE } from '../../hum/copy';
import { HINT_TEXT, HINTS_NOTE, HINTS_TITLE } from '../copy';
import { useDaily } from '../context';
import { consultHints, SETTING_HINTS_SEEN, unseenHints } from '../domain/hints';

export function Hints() {
  const { events, settings, startedDay, setSetting, go } = useDaily();
  const today = logicalDay(new Date());
  const hints = unseenHints(consultHints(events, today, startedDay), settings[SETTING_HINTS_SEEN], today);

  const acknowledge = async () => {
    const seen = { ...(settings[SETTING_HINTS_SEEN] as Record<string, string> | undefined) };
    for (const code of hints) seen[code] = today;
    await setSetting(SETTING_HINTS_SEEN, seen);
    go({ name: 'today' });
  };

  return (
    <Screen
      title={HINTS_TITLE}
      note={HINTS_NOTE}
      align="top"
      onClose={() => go({ name: 'today' })}
      actions={
        <>
          <Btn primary onClick={acknowledge}>
            確認しました
          </Btn>
          <Btn quiet onClick={() => go({ name: 'summary' })}>
            受診サマリを見る
          </Btn>
        </>
      }
    >
      <ul class="plain">
        {hints.map((code) => (
          <li key={code}>{`${HINT_TEXT[code]}（${code}）`}</li>
        ))}
      </ul>
      <h2>{CONSULT_TITLE}</h2>
      <ul class="plain muted">
        {CONSULT_SIGNS.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </Screen>
  );
}
