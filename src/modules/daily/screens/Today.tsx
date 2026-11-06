import { useState } from 'preact/hooks';
import { addDays, dayDiff, logicalDay, longDayLabel } from '../../../platform/events';
import { Icon, type IconName } from '../../../platform/icons';
import { Btn, Group, IconChip, ListRow, Screen, type Tone } from '../../../platform/ui';
import { decongestantText, HINTS_TITLE } from '../copy';
import { useDaily } from '../context';
import { graduationProgress } from '../domain/graduation';
import { consultHints, SETTING_HINTS_SEEN, unseenHints } from '../domain/hints';
import { medList } from '../domain/meds';
import {
  checksOn,
  humSessionOn,
  isDone,
  KIND_ROUTINE,
  RINSE_RETURNS,
  SLOT_LABELS,
  type RinseReturn,
  type RoutineItem,
  type RoutineRecord,
  type RoutineSlot,
  type RoutineType,
} from '../domain/routine';
import { careStreak, completionRate, decongestantRun } from '../domain/streak';
import { overallScore, symptomOn, tagsOn } from '../domain/symptoms';
import { weeklyDue } from '../domain/weekly';
import { BACKFILL_MAX_DAYS } from '../rules';

const SLOTS: RoutineSlot[] = ['morning', 'night'];

const ITEM_ICONS: Record<RoutineType, { icon: IconName; tone: Tone }> = {
  rinse: { icon: 'drop', tone: 'teal' },
  hum: { icon: 'wave', tone: 'violet' },
  steroid: { icon: 'pill', tone: 'amber' },
  decongestant: { icon: 'pill', tone: 'coral' },
  other: { icon: 'check', tone: 'gray' },
};

export function Today({ day }: { day?: string }) {
  const { events, settings, items, startedDay, nav, entry, go, append, openHum } = useDaily();
  const [returnFor, setReturnFor] = useState<string | null>(null);
  const today = logicalDay(new Date());
  const viewing = day ?? today;
  const isToday = viewing === today;
  const checks = checksOn(events, viewing);
  const symptoms = symptomOn(events, viewing);
  const overall = overallScore(symptoms);
  const tags = tagsOn(events, viewing);
  const streak = careStreak(items, events, today, startedDay);
  const rate = completionRate(items, events, today, startedDay);
  const graduation = graduationProgress(events, today, startedDay);
  const run = decongestantRun(events, today);
  const hints = unseenHints(consultHints(events, today, startedDay), settings[SETTING_HINTS_SEEN], today);
  const activeMeds = medList(events).filter((med) => !med.end).length;
  const fromCalendar = entry === 'calendar';

  const toggle = async (item: RoutineItem) => {
    const done = !isDone(item, checks, events, viewing);
    await append<RoutineRecord>(KIND_ROUTINE, { itemId: item.id, itemType: item.type, done }, { day: viewing });
    setReturnFor(done && item.type === 'rinse' ? item.id : null);
  };

  const pickReturn = async (item: RoutineItem, rinseReturn: RinseReturn) => {
    await append<RoutineRecord>(KIND_ROUTINE, { itemId: item.id, itemType: item.type, done: true, rinseReturn }, { day: viewing });
    setReturnFor(null);
  };

  return (
    <Screen
      align="top"
      footer={nav}
      onClose={fromCalendar ? () => go({ name: 'calendar', day: viewing }) : undefined}
      closeLabel="戻る"
    >
      <header class="page-head today-head">
        <div>
          <h1>{isToday ? '今日' : longDayLabel(viewing)}</h1>
          <p class="page-sub">{isToday ? longDayLabel(viewing) : '遡って記録します。'}</p>
        </div>
        <div class="day-nav">
          <button
            type="button"
            class="icon-button"
            aria-label="前の日"
            disabled={dayDiff(viewing, today) >= BACKFILL_MAX_DAYS}
            onClick={() => go({ name: 'today', day: addDays(viewing, -1) })}
          >
            <Icon name="chevronLeft" size={20} />
          </button>
          <button
            type="button"
            class="icon-button"
            aria-label="次の日"
            disabled={isToday}
            onClick={() => go({ name: 'today', day: addDays(viewing, 1) })}
          >
            <Icon name="chevronRight" size={20} />
          </button>
        </div>
      </header>

      {isToday && (
        <section class="hero hero-teal">
          <div class="hero-stats">
            <p class="hero-stat">
              <span class="hero-label">継続</span>
              <strong>{streak}</strong>
              <span class="hero-unit">日</span>
            </p>
            <p class="hero-stat">
              <span class="hero-label">実施率</span>
              <strong>{rate == null ? '－' : Math.round(rate * 100)}</strong>
              <span class="hero-unit">%</span>
            </p>
          </div>
          <div class="hero-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.round((graduation.days / graduation.target) * 100))}%` }} />
          </div>
          <p class="hero-foot">{graduation.reached ? '卒業の目安に届きました' : `卒業まで ${graduation.days}/${graduation.target}日`}</p>
        </section>
      )}

      {isToday && hints.length > 0 && (
        <Group>
          <ListRow icon="alert" tone="amber" label={HINTS_TITLE} onClick={() => go({ name: 'hints' })} />
        </Group>
      )}

      {SLOTS.map((slot) => {
        const slotItems = items.filter((item) => item.slot === slot);
        if (!slotItems.length) return null;
        return (
          <Group key={slot} title={`${SLOT_LABELS[slot]}のケア`}>
            {slotItems.map((item) => {
              const done = isDone(item, checks, events, viewing);
              const auto = item.type === 'hum' && humSessionOn(events, viewing);
              const warning = item.type === 'decongestant' ? decongestantText(run) : null;
              const look = ITEM_ICONS[item.type];
              return (
                <div key={item.id} class="check-item">
                  <div class="check-row">
                    <IconChip icon={look.icon} tone={look.tone} />
                    <button type="button" class="check-label" disabled={auto} onClick={() => toggle(item)}>
                      {item.label}
                      {auto && <small>ハミングの記録から</small>}
                    </button>
                    {item.type === 'hum' && isToday && !done && (
                      <button type="button" class="pill" onClick={openHum}>
                        始める
                      </button>
                    )}
                    <button
                      type="button"
                      class={`check ${done ? 'checked' : ''}`}
                      role="checkbox"
                      aria-checked={done}
                      aria-label={item.label}
                      disabled={auto}
                      onClick={() => toggle(item)}
                    >
                      <Icon name="check" size={18} />
                    </button>
                  </div>
                  {warning && <p class="note check-note">{warning}</p>}
                  {returnFor === item.id && (
                    <div class="inline-choice">
                      <p class="note">洗浄液の戻りは(任意)</p>
                      <div class="chips">
                        {RINSE_RETURNS.map((option) => (
                          <button type="button" key={option.id} class="chip" onClick={() => pickReturn(item, option.id)}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </Group>
        );
      })}

      {symptoms ? (
        <Group title="症状">
          <ListRow
            icon="note"
            tone="coral"
            label={overall == null ? '記録あり' : `総合 ${overall}`}
            detail="直す"
            onClick={() => go({ name: 'symptoms', day: viewing })}
          />
          <ListRow
            icon="tag"
            tone="coral"
            label={tags.length ? tags.join('、') : 'タグなし'}
            detail="選ぶ"
            onClick={() => go({ name: 'tags', day: viewing })}
          />
        </Group>
      ) : (
        <section class="card cta-card">
          <div class="cta-head">
            <IconChip icon="note" tone="coral" />
            <div>
              <strong>症状</strong>
              <small>6つの質問に0〜10で答えます</small>
            </div>
          </div>
          <Btn primary onClick={() => go({ name: 'symptoms', day: viewing })}>
            {isToday ? '今日の症状を記録する' : 'この日の症状を記録する'}
          </Btn>
        </section>
      )}

      {isToday && (
        <Group>
          {weeklyDue(events, today, startedDay) && (
            <ListRow icon="refresh" tone="indigo" label="今週の振り返りをする" onClick={() => go({ name: 'weekly' })} />
          )}
          <ListRow
            icon="pill"
            tone="amber"
            label="薬と受診"
            sub={activeMeds ? `使用中の薬 ${activeMeds}件` : '開始日と受診日を残せます'}
            onClick={() => go({ name: 'meds' })}
          />
        </Group>
      )}
    </Screen>
  );
}
