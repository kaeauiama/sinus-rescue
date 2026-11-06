import { logicalDay, longDayLabel } from '../../../platform/events';
import { Icon } from '../../../platform/icons';
import { Group, ListRow, Screen } from '../../../platform/ui';
import { useHum } from '../context';
import { noteName } from '../domain/dsp';
import {
  buildPlan,
  DEFAULT_SESSION,
  planSummary,
  planTones,
  resumableProgress,
  SETTING_PROGRESS,
  SETTING_SESSION,
  type SessionProgress,
  type SessionSettings,
} from '../domain/session';
import { CONDITION_LABELS, conditionOn, currentExperiment, tonesForToday } from '../domain/experiment';
import { toneLabel } from '../domain/sites';
import { currentTones, latestProfile } from '../domain/tones';

export function Home() {
  const { events, settings, nav, go, openWithMic, openWithoutMic } = useHum();
  const today = logicalDay(new Date());
  const profile = latestProfile(events);
  const tones = currentTones(events);
  const stored = { ...DEFAULT_SESSION, ...(settings[SETTING_SESSION] as Partial<SessionSettings> | undefined) };
  const plan = buildPlan(stored, planTones(stored, tonesForToday(events, tones), profile));
  const progress = resumableProgress(settings[SETTING_PROGRESS] as SessionProgress | undefined, plan, today);
  const experiment = currentExperiment(events);
  const condition = experiment && conditionOn(experiment, today);
  const timer = () => openWithoutMic({ name: 'session', mode: 'timer' });

  const resume = () => {
    if (!progress) return;
    const route = { name: 'session', mode: progress.mode, resumeFrom: progress.cursor } as const;
    if (progress.mode === 'tuner') openWithMic(route);
    else openWithoutMic(route);
  };

  const head = (
    <header class="page-head">
      <h1>ハミング</h1>
      <p class="page-sub">{longDayLabel(today)}</p>
    </header>
  );

  if (!profile) {
    return (
      <Screen align="top" footer={nav}>
        {head}
        <section class="hero hero-violet">
          <p class="hero-label">最初に1回だけ</p>
          <p class="hero-text">声の高さを測ると、自分に響く音を探せるようになります。</p>
          <button type="button" class="hero-button" onClick={() => openWithMic({ name: 'setup' })}>
            <Icon name="mic" size={20} />
            声の高さを測る
          </button>
        </section>
        <Group>
          <ListRow icon="clock" tone="indigo" label="タイマーだけ使う" sub="音を鳴らさず合図だけ出します" onClick={timer} />
        </Group>
      </Screen>
    );
  }

  return (
    <Screen align="top" footer={nav}>
      {head}
      <section class="hero hero-violet">
        <p class="hero-label">今日のハミング</p>
        <p class="hero-value">{planSummary(plan)}</p>
        <div class="hero-links">
          <button type="button" class="hero-chip" onClick={() => go({ name: 'plan' })}>
            内容を変える
          </button>
          {experiment && (
            <button type="button" class="hero-chip" onClick={() => go({ name: 'experiment' })}>
              {condition ? `比較中: 今日は${CONDITION_LABELS[condition]}` : '比較の結果を見る'}
            </button>
          )}
        </div>
        <button
          type="button"
          class="hero-button"
          onClick={progress ? resume : () => openWithMic({ name: 'session', mode: 'tuner' })}
        >
          <Icon name="play" size={20} />
          {progress ? '続きから始める' : 'ハミングを始める'}
        </button>
      </section>

      <Group title="響く音">
        {tones.length === 0 && <p class="card-empty">まだ登録はありません。楽な高さの音で始めます。</p>}
        {tones.map((tone) => (
          <ListRow
            key={tone.toneId}
            icon="wave"
            tone="violet"
            label={toneLabel(tone.site)}
            detail={`${noteName(tone.hz)}  ${Math.round(tone.hz)}Hz`}
            onClick={() => go({ name: 'tone', toneId: tone.toneId })}
          />
        ))}
        <ListRow icon="plus" tone="gray" label="音を登録する" onClick={() => openWithMic({ name: 'register' })} />
      </Group>

      <Group title="ほかの使い方">
        <ListRow icon="clock" tone="indigo" label="タイマーだけ使う" sub="音を鳴らさず合図だけ出します" onClick={timer} />
        {!experiment && (
          <ListRow icon="shuffle" tone="amber" label="比べる" sub="登録した音と楽な高さの音を交互に使います" onClick={() => go({ name: 'experiment' })} />
        )}
      </Group>
    </Screen>
  );
}
