import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';
import type { LogEvent } from '../../platform/events';
import type { AppStore, Settings } from '../../platform/store';
import type { AudioEngine, MicFailure } from './audio/engine';
import type { SiteId } from './domain/sites';

export const SETTING_NOTICE = 'hum.noticeAcceptedAt';

export type Route =
  | { name: 'notice' }
  | { name: 'home' }
  | { name: 'morning' }
  | { name: 'setup'; then?: 'register' }
  | { name: 'register'; toneId?: string; site?: SiteId; attempt?: number }
  | { name: 'tone'; toneId: string }
  | { name: 'session'; mode: 'tuner' | 'timer'; resumeFrom?: number }
  | { name: 'plan' }
  | { name: 'experiment' }
  | { name: 'records' }
  | { name: 'settings' }
  | { name: 'info' }
  | { name: 'micError'; code: MicFailure };

export interface HumServices {
  engine: AudioEngine;
  store: AppStore;
  nav?: ComponentChildren;
  entry: 'home' | 'records' | 'settings';
  settingsExtra?: ComponentChildren;
  events: LogEvent[];
  settings: Settings;
  append: <P>(kind: string, payload: P) => Promise<void>;
  appendAll: (events: LogEvent[]) => Promise<void>;
  setSetting: (key: string, value: unknown) => Promise<void>;
  resetAll: () => Promise<void>;
  go: (route: Route) => void;
  openWithMic: (route: Route) => void;
  openWithoutMic: (route: Route) => void;
}

export const HumContext = createContext<HumServices>(null as never);

export const useHum = () => useContext(HumContext);

// タイマーの中から常に最新のコールバックを呼ぶためのもの。
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = async () => {
      try {
        lock = (await navigator.wakeLock?.request('screen')) ?? null;
        if (released) void lock?.release();
      } catch {
        // 画面の点灯維持は補助機能なので、取得できなくても続ける。
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}
