import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { createEvent, type EventOptions, logicalDay, type LogEvent } from '../../platform/events';
import { requestPersistentStorage } from '../../platform/pwa';
import type { AppStore, Settings } from '../../platform/store';
import { morningDue, SETTING_MORNING_SKIPPED } from '../hum/domain/history';
import { DailyContext, SETTING_DAILY_NOTICE, type DailyEntry, type DailyServices, type Route } from './context';
import { firstRecordedDay, routineItems, SETTING_ROUTINE, SETTING_STARTED } from './domain/routine';
import { DailyInfo } from './screens/DailyInfo';
import { DailyNotice } from './screens/DailyNotice';
import { DailySettings } from './screens/DailySettings';
import { Calendar } from './screens/Calendar';
import { Hints } from './screens/Hints';
import { Meds } from './screens/Meds';
import { MorningCheck } from './screens/MorningCheck';
import { Reminders } from './screens/Reminders';
import { RinseSettings } from './screens/RinseSettings';
import { RoutineEdit } from './screens/RoutineEdit';
import { Summary } from './screens/Summary';
import { SymptomFlow } from './screens/SymptomFlow';
import { TagEdit } from './screens/TagEdit';
import { Tags } from './screens/Tags';
import { Today } from './screens/Today';
import { Weekly } from './screens/Weekly';

function firstRoute(events: LogEvent[], settings: Settings, entry: DailyEntry): Route {
  if (!settings[SETTING_DAILY_NOTICE]) return { name: 'notice' };
  if (entry === 'today' && morningDue(events, settings[SETTING_MORNING_SKIPPED], new Date())) return { name: 'morning' };
  return { name: entry };
}

function Screens({ route }: { route: Route }) {
  switch (route.name) {
    case 'notice':
      return <DailyNotice />;
    case 'morning':
      return <MorningCheck />;
    case 'symptoms':
      return <SymptomFlow key={route.day} day={route.day} />;
    case 'tags':
      return <Tags key={route.day} day={route.day} />;
    case 'weekly':
      return <Weekly />;
    case 'calendar':
      return <Calendar key={route.day ?? 'today'} day={route.day} />;
    case 'meds':
      return <Meds />;
    case 'summary':
      return <Summary />;
    case 'hints':
      return <Hints />;
    case 'settings':
      return <DailySettings />;
    case 'routine':
      return <RoutineEdit />;
    case 'tagEdit':
      return <TagEdit />;
    case 'rinse':
      return <RinseSettings />;
    case 'reminders':
      return <Reminders />;
    case 'info':
      return <DailyInfo />;
    default:
      return <Today key={route.day ?? 'today'} day={route.day} />;
  }
}

interface DailyAppProps {
  store: AppStore;
  nav?: ComponentChildren;
  entry?: DailyEntry;
  onReset?: () => void;
  onOpenHum?: () => void;
  onDisable?: () => void;
}

// 日々の記録の入口。ハミングの記録は読むだけで、ハミング側からはこのモジュールを参照しない(HC-8)。
export function DailyApp({ store, nav, entry = 'today', onReset, onOpenHum, onDisable }: DailyAppProps) {
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [route, setRoute] = useState<Route>({ name: 'today' });

  useEffect(() => {
    void (async () => {
      const [loadedEvents, loadedSettings] = await Promise.all([store.loadEvents(), store.loadSettings()]);
      setSettings(loadedSettings);
      setEvents(loadedEvents);
      setRoute(firstRoute(loadedEvents, loadedSettings, entry));
    })();
  }, [store, entry]);

  const append = useCallback(
    async <P,>(kind: string, payload: P, options?: EventOptions) => {
      const event = createEvent(kind, payload, new Date(), options);
      await store.addEvents([event]);
      setEvents((current) => [...(current ?? []), event]);
      void requestPersistentStorage();
    },
    [store],
  );

  const appendAll = useCallback(
    async (added: LogEvent[]) => {
      await store.addEvents(added);
      setEvents(await store.loadEvents());
    },
    [store],
  );

  const setSetting = useCallback(
    async (key: string, value: unknown) => {
      setSettings((current) => ({ ...current, [key]: value }));
      await store.setSetting(key, value);
    },
    [store],
  );

  const resetAll = useCallback(async () => {
    await store.clear();
    onReset?.();
  }, [store, onReset]);

  const services = useMemo<DailyServices | null>(
    () =>
      events && {
        store,
        nav,
        entry,
        events,
        settings,
        items: routineItems(settings[SETTING_ROUTINE]),
        startedDay: firstRecordedDay(events, settings[SETTING_STARTED], logicalDay(new Date())),
        append,
        appendAll,
        setSetting,
        resetAll,
        go: setRoute,
        openHum: () => onOpenHum?.(),
        disable: () => onDisable?.(),
      },
    [store, nav, entry, events, settings, append, appendAll, setSetting, resetAll, onOpenHum, onDisable],
  );

  if (!services) return <div class={`screen ${nav ? 'with-tabs' : ''}`} aria-busy="true">{nav}</div>;

  return (
    <DailyContext.Provider value={services}>
      <Screens route={route} />
    </DailyContext.Provider>
  );
}
