import { Screen } from '../../../platform/ui';
import {
  BACKGROUND_LINES,
  BACKGROUND_TITLE,
  CONSULT_SIGNS,
  CONSULT_TITLE,
  DANGER_SIGNS,
  DANGER_TITLE,
  NOTICE_LINES,
  POSTURE_LINES,
  POSTURE_TITLE,
} from '../copy';
import { useHum } from '../context';

function Section({ title, lines }: { title: string; lines: string[] }) {
  return (
    <>
      <h2>{title}</h2>
      <ul class="plain muted">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

export function Info() {
  const { go } = useHum();
  return (
    <Screen title="情報" align="top" onClose={() => go({ name: 'settings' })} closeLabel="戻る">
      <ul class="plain muted">
        {NOTICE_LINES.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <Section title={DANGER_TITLE} lines={DANGER_SIGNS} />
      <Section title={CONSULT_TITLE} lines={CONSULT_SIGNS} />
      <Section title={POSTURE_TITLE} lines={POSTURE_LINES} />
      <Section title={BACKGROUND_TITLE} lines={BACKGROUND_LINES} />
    </Screen>
  );
}
