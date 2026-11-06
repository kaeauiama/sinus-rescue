import { useState } from 'preact/hooks';
import { Btn, Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import { DEFAULT_TAGS, KIND_TAG, SETTING_TAGS, tagsOn, type TagRecord } from '../domain/symptoms';

export function Tags({ day }: { day: string }) {
  const { events, settings, append, go } = useDaily();
  const prior = tagsOn(events, day);
  const [selected, setSelected] = useState(prior);
  const tags = (settings[SETTING_TAGS] as string[] | undefined) ?? DEFAULT_TAGS;

  const toggle = (tag: string) =>
    setSelected((current) => (current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag]));

  const save = async () => {
    const changed = prior.length !== selected.length || selected.some((tag) => !prior.includes(tag));
    if (changed) await append<TagRecord>(KIND_TAG, { tags: selected }, { day });
    go({ name: 'today', day });
  };

  return (
    <Screen
      title="今日あったことは"
      note="なければ、そのまま進んでください。"
      actions={
        <Btn primary onClick={save}>
          記録する
        </Btn>
      }
    >
      <div class="chips spaced">
        {tags.map((tag) => (
          <button
            type="button"
            key={tag}
            class={`chip ${selected.includes(tag) ? 'chip-active' : ''}`}
            aria-pressed={selected.includes(tag)}
            onClick={() => toggle(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
    </Screen>
  );
}
