import { useState } from 'preact/hooks';
import { addDays } from '../../../platform/events';
import { Btn, Screen, ScoreGrid } from '../../../platform/ui';
import { SCORE_ANCHORS } from '../copy';
import { useDaily } from '../context';
import { KIND_SYMPTOM, SIDE_LABELS, symptomOn, SYMPTOMS, type Side, type SymptomRecord } from '../domain/symptoms';
import { LATERALITY_PROMPT_MIN } from '../rules';

const SIDES: Side[] = ['left', 'right', 'both'];

// 1画面1問で進める。1タップで次へ移るので、説明を読まなくても1分以内に終わる。
export function SymptomFlow({ day }: { day: string }) {
  const { events, append, go } = useDaily();
  const prior = symptomOn(events, day);
  const yesterday = prior ? null : symptomOn(events, addDays(day, -1));
  const [index, setIndex] = useState(0);
  const [record, setRecord] = useState<SymptomRecord>(prior ?? { scores: {}, sides: {} });
  const [askSide, setAskSide] = useState(false);
  const symptom = SYMPTOMS[index];

  const advance = async (next: SymptomRecord) => {
    setRecord(next);
    setAskSide(false);
    if (index + 1 < SYMPTOMS.length) {
      setIndex(index + 1);
      return;
    }
    await append<SymptomRecord>(KIND_SYMPTOM, next, { day });
    go({ name: 'tags', day });
  };

  const pick = (score: number) => {
    const sides = { ...record.sides };
    if (score < LATERALITY_PROMPT_MIN) delete sides[symptom.id];
    const next = { scores: { ...record.scores, [symptom.id]: score }, sides };
    if (symptom.sided && score >= LATERALITY_PROMPT_MIN) {
      setRecord(next);
      setAskSide(true);
    } else {
      void advance(next);
    }
  };

  const skip = () => {
    const scores = { ...record.scores };
    const sides = { ...record.sides };
    delete scores[symptom.id];
    delete sides[symptom.id];
    void advance({ scores, sides });
  };

  const sameAsYesterday = async () => {
    if (!yesterday) return;
    await append<SymptomRecord>(KIND_SYMPTOM, yesterday, { day, source: 'same_as_yesterday' });
    go({ name: 'today', day });
  };

  const back = () => {
    if (askSide) setAskSide(false);
    else if (index > 0) setIndex(index - 1);
    else go({ name: 'today', day });
  };

  if (askSide) {
    return (
      <Screen
        title="どちら側ですか"
        note={symptom.label}
        progress={index / SYMPTOMS.length}
        onClose={back}
        closeLabel="戻る"
        actions={
          <>
            <div class="choices row-3">
              {SIDES.map((side) => (
                <Btn key={side} onClick={() => advance({ ...record, sides: { ...record.sides, [symptom.id]: side } })}>
                  {SIDE_LABELS[side]}
                </Btn>
              ))}
            </div>
            <Btn quiet onClick={() => advance(record)}>
              飛ばす
            </Btn>
          </>
        }
      />
    );
  }

  return (
    <Screen
      title={symptom.question}
      note={SCORE_ANCHORS}
      progress={index / SYMPTOMS.length}
      onClose={back}
      closeLabel="戻る"
      actions={
        <>
          <ScoreGrid value={record.scores[symptom.id]} onPick={pick} />
          {index === 0 && yesterday ? (
            <Btn quiet onClick={sameAsYesterday}>
              全部昨日と同じ
            </Btn>
          ) : (
            <Btn quiet onClick={skip}>
              飛ばす
            </Btn>
          )}
        </>
      }
    />
  );
}
