import { useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import { KIND_WEEKLY, SCENTS, SETTING_SCENT, SMELL_RESULTS, type SmellResult, type WeeklyRecord } from '../domain/weekly';

const CHANGES = [-3, -2, -1, 0, 1, 2, 3];

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');

export function Weekly() {
  const { items, settings, append, setSetting, go } = useDaily();
  const [step, setStep] = useState<'change' | 'smell' | 'clean'>('change');
  const [record, setRecord] = useState<WeeklyRecord>({ change: 0, scent: null, smell: null, cleaned: null });
  const [scent, setScent] = useState((settings[SETTING_SCENT] as string | undefined) ?? SCENTS[0]);
  const usesRinse = items.some((item) => item.type === 'rinse');

  const save = async (next: WeeklyRecord) => {
    await append<WeeklyRecord>(KIND_WEEKLY, next);
    go({ name: 'today' });
  };

  const afterSmell = (next: WeeklyRecord) => {
    if (usesRinse) {
      setRecord(next);
      setStep('clean');
    } else {
      void save(next);
    }
  };

  const answerSmell = async (smell: SmellResult) => {
    await setSetting(SETTING_SCENT, scent);
    afterSmell({ ...record, scent, smell });
  };

  if (step === 'change') {
    return (
      <Screen
        title="先週と比べてどうですか"
        note="−3 かなり悪くなった　0 同じ　+3 かなり良くなった"
        onClose={() => go({ name: 'today' })}
        actions={
          <div class="grid-changes">
            {CHANGES.map((change) => (
              <Btn
                key={change}
                onClick={() => {
                  setRecord({ ...record, change });
                  setStep('smell');
                }}
              >
                {signed(change)}
              </Btn>
            ))}
          </div>
        }
      />
    );
  }

  if (step === 'smell') {
    return (
      <Screen
        title="いつもの香りを嗅いでみてください"
        onBack={() => save(record)}
        note="毎週同じものを使うと、自分の中での変化を見られます。"
        actions={
          <>
            <div class="choices">
              {SMELL_RESULTS.map((result) => (
                <Btn key={result.id} onClick={() => answerSmell(result.id)}>
                  {result.label}
                </Btn>
              ))}
            </div>
            <Btn quiet onClick={() => afterSmell(record)}>
              飛ばす
            </Btn>
          </>
        }
      >
        <div class="chips spaced">
          {SCENTS.map((option) => (
            <button
              type="button"
              key={option}
              class={`chip ${scent === option ? 'chip-active' : ''}`}
              aria-pressed={scent === option}
              onClick={() => setScent(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </Screen>
    );
  }

  return (
    <Screen
      title="今週、洗浄の器具を洗いましたか"
      onBack={() => save({ ...record, cleaned: null })}
      actions={
        <div class="choices">
          <Btn onClick={() => save({ ...record, cleaned: true })}>はい</Btn>
          <Btn onClick={() => save({ ...record, cleaned: false })}>いいえ</Btn>
        </div>
      }
    />
  );
}
