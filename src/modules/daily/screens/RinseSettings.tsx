import { useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { WATER_CAUTION, WATER_LINES, WATER_TITLE } from '../copy';
import { useDaily } from '../context';
import {
  currentProtocol,
  KIND_PROTOCOL,
  needsWaterCaution,
  RINSE_SOLUTIONS,
  RINSE_TEMPS,
  RINSE_VOLUMES,
  RINSE_WATERS,
  type RinseProtocol,
} from '../domain/rinse';

interface ChoiceProps<T> {
  title: string;
  options: { id: T; label: string }[];
  value: T | null;
  onPick: (value: T) => void;
}

function Choice<T extends string | number>({ title, options, value, onPick }: ChoiceProps<T>) {
  return (
    <>
      <h2>{title}</h2>
      <div class="chips">
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            class={`chip ${value === option.id ? 'chip-active' : ''}`}
            aria-pressed={value === option.id}
            onClick={() => onPick(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );
}

const asOptions = (values: string[]) => values.map((value) => ({ id: value, label: value }));

export function RinseSettings() {
  const { events, append, go } = useDaily();
  const saved = currentProtocol(events);
  const [protocol, setProtocol] = useState<RinseProtocol>(saved);
  const changed = JSON.stringify(saved) !== JSON.stringify(protocol);

  const save = async () => {
    await append<RinseProtocol>(KIND_PROTOCOL, protocol);
    go({ name: 'settings' });
  };

  return (
    <Screen
      title="洗浄の手順"
      note="一度決めれば毎日の入力はいりません。変えると記録に残ります。"
      align="top"
      onClose={() => go({ name: 'settings' })}
      closeLabel="戻る"
      actions={
        changed && (
          <Btn primary onClick={save}>
            保存する
          </Btn>
        )
      }
    >
      <Choice title={WATER_TITLE} options={RINSE_WATERS} value={protocol.water} onPick={(water) => setProtocol({ ...protocol, water })} />
      {needsWaterCaution(protocol.water) ? <p class="note">{WATER_CAUTION}</p> : <p class="note">{WATER_LINES[0]}</p>}
      <Choice title="洗浄液" options={asOptions(RINSE_SOLUTIONS)} value={protocol.solution} onPick={(solution) => setProtocol({ ...protocol, solution })} />
      <Choice title="温度" options={asOptions(RINSE_TEMPS)} value={protocol.temp} onPick={(temp) => setProtocol({ ...protocol, temp })} />
      <Choice
        title="1回の量"
        options={RINSE_VOLUMES.map((ml) => ({ id: ml, label: `${ml}mL` }))}
        value={protocol.volumeMl}
        onPick={(volumeMl) => setProtocol({ ...protocol, volumeMl })}
      />
    </Screen>
  );
}
