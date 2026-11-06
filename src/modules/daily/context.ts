import { createContext, type ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';
import type { EventOptions, LogEvent } from '../../platform/events';
import type { AppStore, Settings } from '../../platform/store';
import type { RoutineItem } from './domain/routine';

export const SETTING_DAILY_NOTICE = 'daily.noticeAcceptedAt';
export const SETTING_HIDE_CHART = 'daily.hideChart';

export type DailyEntry = 'today' | 'calendar' | 'settings';

export type Route =
  | { name: 'notice' }
  | { name: 'today'; day?: string }
  | { name: 'calendar'; day?: string }
  | { name: 'morning' }
  | { name: 'symptoms'; day: string }
  | { name: 'tags'; day: string }
  | { name: 'weekly' }
  | { name: 'meds' }
  | { name: 'summary' }
  | { name: 'hints' }
  | { name: 'settings' }
  | { name: 'routine' }
  | { name: 'tagEdit' }
  | { name: 'rinse' }
  | { name: 'reminders' }
  | { name: 'info' };

export interface DailyServices {
  store: AppStore;
  nav?: ComponentChildren;
  entry: DailyEntry;
  events: LogEvent[];
  settings: Settings;
  items: RoutineItem[];
  startedDay: string;
  append: <P>(kind: string, payload: P, options?: EventOptions) => Promise<void>;
  appendAll: (events: LogEvent[]) => Promise<void>;
  setSetting: (key: string, value: unknown) => Promise<void>;
  resetAll: () => Promise<void>;
  go: (route: Route) => void;
  openHum: () => void;
  disable: () => void;
}

export const DailyContext = createContext<DailyServices>(null as never);

export const useDaily = () => useContext(DailyContext);
