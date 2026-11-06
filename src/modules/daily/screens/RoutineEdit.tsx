import { Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import { SETTING_ROUTINE, SLOT_LABELS, type RoutineItem, type RoutineSlot } from '../domain/routine';

const SLOTS: RoutineSlot[] = ['morning', 'night'];

export function RoutineEdit() {
  const { items, setSetting, go } = useDaily();
  const save = (next: RoutineItem[]) => setSetting(SETTING_ROUTINE, next);
  const update = (id: string, change: Partial<RoutineItem>) =>
    save(items.map((item) => (item.id === id ? { ...item, ...change } : item)));

  const add = () =>
    save([...items, { id: crypto.randomUUID(), label: '新しい項目', slot: 'night', type: 'other', streak: false }]);

  return (
    <Screen
      title="ルーチンの項目"
      note="「継続」をオンにした項目が、すべて済んだ日を数えます。"
      align="top"
      onClose={() => go({ name: 'settings' })}
      closeLabel="戻る"
    >
      <ul class="edit-list">
        {items.map((item) => (
          <li key={item.id}>
            <input
              type="text"
              aria-label="項目の名前"
              value={item.label}
              onChange={(e) => update(item.id, { label: (e.currentTarget as HTMLInputElement).value })}
            />
            <div class="chips">
              {SLOTS.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  class={`chip ${item.slot === slot ? 'chip-active' : ''}`}
                  aria-pressed={item.slot === slot}
                  onClick={() => update(item.id, { slot })}
                >
                  {SLOT_LABELS[slot]}
                </button>
              ))}
              {item.type !== 'decongestant' && (
                <button
                  type="button"
                  class={`chip ${item.streak ? 'chip-active' : ''}`}
                  aria-pressed={item.streak}
                  onClick={() => update(item.id, { streak: !item.streak })}
                >
                  継続
                </button>
              )}
              <button type="button" class="link danger" onClick={() => save(items.filter((i) => i.id !== item.id))}>
                外す
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button type="button" class="link add" onClick={add}>
        項目を追加する
      </button>
    </Screen>
  );
}
