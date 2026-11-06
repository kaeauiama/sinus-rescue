import { useState } from 'preact/hooks';
import { Screen } from '../../../platform/ui';
import { useDaily } from '../context';
import { DEFAULT_TAGS, SETTING_TAGS } from '../domain/symptoms';
import { MAX_TAGS } from '../rules';

export function TagEdit() {
  const { settings, setSetting, go } = useDaily();
  const [draft, setDraft] = useState('');
  const tags = (settings[SETTING_TAGS] as string[] | undefined) ?? DEFAULT_TAGS;

  const add = async (event: Event) => {
    event.preventDefault();
    const tag = draft.trim();
    if (!tag || tags.includes(tag) || tags.length >= MAX_TAGS) return;
    await setSetting(SETTING_TAGS, [...tags, tag]);
    setDraft('');
  };

  return (
    <Screen
      title="タグ"
      note={`悪くなる理由は人それぞれなので、自分に関係のあるものを${MAX_TAGS}個まで置けます。`}
      align="top"
      onClose={() => go({ name: 'settings' })}
      closeLabel="戻る"
    >
      <ul class="tone-order">
        {tags.map((tag) => (
          <li key={tag}>
            <div class="grow">
              <span>{tag}</span>
            </div>
            <button type="button" class="link danger" onClick={() => setSetting(SETTING_TAGS, tags.filter((t) => t !== tag))}>
              外す
            </button>
          </li>
        ))}
      </ul>
      {tags.length < MAX_TAGS && (
        <form class="field" onSubmit={add}>
          <input
            type="text"
            aria-label="新しいタグ"
            placeholder="新しいタグ"
            value={draft}
            onInput={(e) => setDraft((e.currentTarget as HTMLInputElement).value)}
          />
          <button type="submit" class="link add">
            追加する
          </button>
        </form>
      )}
    </Screen>
  );
}
