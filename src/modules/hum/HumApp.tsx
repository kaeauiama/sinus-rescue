import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createEvent, type LogEvent } from '../../platform/events';
import { requestPersistentStorage } from '../../platform/pwa';
import type { AppStore, Settings } from '../../platform/store';
import { AudioEngine } from './audio/engine';
import { HumContext, SETTING_NOTICE, type HumServices, type Route } from './context';
import { SIMULATE } from './debug';
import { morningDue, SETTING_MORNING_SKIPPED } from './domain/history';
import { latestProfile } from './domain/tones';
import { ExperimentScreen } from './screens/ExperimentScreen';
import { Home } from './screens/Home';
import { HumSettings } from './screens/HumSettings';
import { Info } from './screens/Info';
import { MicError } from './screens/MicError';
import { Morning } from './screens/Morning';
import { Notice } from './screens/Notice';
import { PlanSettings } from './screens/PlanSettings';
import { Records } from './screens/Records';
import { Register } from './screens/Register';
import { Session } from './screens/Session';
import { Setup } from './screens/Setup';
import { ToneDetail } from './screens/ToneDetail';

const MIC_ROUTES: Route['name'][] = ['setup', 'register', 'session'];

export type HumEntry = 'home' | 'records' | 'settings';

function firstRoute(events: LogEvent[], settings: Settings, entry: HumEntry): Route {
  if (!settings[SETTING_NOTICE]) return { name: 'notice' };
  if (entry === 'home' && morningDue(events, settings[SETTING_MORNING_SKIPPED], new Date())) return { name: 'morning' };
  return { name: entry };
}

function Screens({ route }: { route: Route }) {
  switch (route.name) {
    case 'notice':
      return <Notice />;
    case 'morning':
      return <Morning />;
    case 'setup':
      return <Setup then={route.then} />;
    case 'register':
      return <Register key={route.toneId ?? `new-${route.attempt ?? 0}`} toneId={route.toneId} site={route.site} />;
    case 'tone':
      return <ToneDetail toneId={route.toneId} />;
    case 'session':
      return <Session mode={route.mode} resumeFrom={route.resumeFrom} />;
    case 'plan':
      return <PlanSettings />;
    case 'experiment':
      return <ExperimentScreen />;
    case 'records':
      return <Records />;
    case 'settings':
      return <HumSettings />;
    case 'info':
      return <Info />;
    case 'micError':
      return <MicError code={route.code} />;
    default:
      return <Home />;
  }
}

interface HumAppProps {
  store: AppStore;
  nav?: ComponentChildren;
  entry?: HumEntry;
  onReset?: () => void;
  settingsExtra?: ComponentChildren;
}

// ハミング機能の入口。他のモジュールや通知サーバーに依存せず、これだけで完結する(HC-8)。
export function HumApp({ store, nav, entry = 'home', onReset, settingsExtra }: HumAppProps) {
  const engine = useRef(new AudioEngine({ simulate: SIMULATE })).current;
  const [events, setEvents] = useState<LogEvent[] | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [route, setRoute] = useState<Route>({ name: 'home' });

  useEffect(() => {
    void (async () => {
      const [loadedEvents, loadedSettings] = await Promise.all([store.loadEvents(), store.loadSettings()]);
      setSettings(loadedSettings);
      setEvents(loadedEvents);
      setRoute(firstRoute(loadedEvents, loadedSettings, entry));
    })();
  }, [store, entry]);

  useEffect(() => {
    if (!MIC_ROUTES.includes(route.name)) engine.stopMic();
  }, [engine, route]);

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void engine.ensureRunning();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [engine]);

  const append = useCallback(
    async <P,>(kind: string, payload: P) => {
      const event = createEvent(kind, payload);
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
    setEvents([]);
    setSettings({});
    setRoute({ name: 'notice' });
    onReset?.();
  }, [store, onReset]);

  const openWithMic = useCallback(
    (next: Route) => {
      // 音声の開始にはユーザー操作が必要なので、ボタンの押下から同期的に始める。
      void engine.prepare({ mic: true }).then((result) => {
        if (result.ok) setRoute(next);
        else setRoute({ name: 'micError', code: result.code });
      });
    },
    [engine],
  );

  const openWithoutMic = useCallback(
    (next: Route) => {
      void engine.prepare({ mic: false }).then(() => setRoute(next));
    },
    [engine],
  );

  const services = useMemo<HumServices | null>(
    () =>
      events && {
        engine,
        store,
        nav,
        entry,
        settingsExtra,
        events,
        settings,
        append,
        appendAll,
        setSetting,
        resetAll,
        go: setRoute,
        openWithMic,
        openWithoutMic,
      },
    [engine, store, nav, entry, settingsExtra, events, settings, append, appendAll, setSetting, resetAll, openWithMic, openWithoutMic],
  );

  if (!services) return <div class={`screen ${nav ? 'with-tabs' : ''}`} aria-busy="true">{nav}</div>;

  // 声の高さが未測定のまま探索を開こうとしたら、先に測定へ案内する。
  const resolved: Route =
    route.name === 'register' && !latestProfile(services.events) ? { name: 'setup', then: 'register' } : route;

  return (
    <HumContext.Provider value={services}>
      <Screens route={resolved} />
    </HumContext.Provider>
  );
}
