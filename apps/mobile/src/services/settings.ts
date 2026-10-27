import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

export interface Settings {
  /** e.g. http://192.168.0.147:3020 at home, or an https address when exposed. */
  serverUrl: string;
  appKey: string;
  coachEnabled: boolean;
  /** "6:40" per km; empty disables "too fast" warnings. */
  usualPace: string;
  /** Feed fake GPS, for trying the app indoors. */
  simulateGps: boolean;
  keepAwake: boolean;
  selectedWorkoutId: string;
}

const DEFAULTS: Settings = {
  serverUrl: '',
  appKey: '',
  coachEnabled: true,
  usualPace: '',
  simulateGps: Platform.OS === 'web',
  keepAwake: false,
  selectedWorkoutId: 'wr-1-1',
};

const KEY = 'settings';
const SECRET_KEY = 'appKey';

let current: Settings = DEFAULTS;
const listeners = new Set<() => void>();

async function read(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
}

async function write(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      localStorage.setItem(key, value);
    } catch {}
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

let loading: Promise<Settings> | null = null;

/** Reads stored settings once; later calls share the same load. */
export function loadSettings(): Promise<Settings> {
  loading ??= (async () => {
    const [raw, secret] = await Promise.all([read(KEY), read(SECRET_KEY)]);
    try {
      current = { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}), appKey: secret ?? '' };
    } catch {
      current = { ...DEFAULTS, appKey: secret ?? '' };
    }
    listeners.forEach(l => l());
    return current;
  })();
  return loading;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  // Never write before the stored values are in, or defaults would overwrite them.
  await loadSettings();
  current = { ...current, ...patch };
  listeners.forEach(l => l());
  const { appKey, ...rest } = current;
  await Promise.all([write(KEY, JSON.stringify(rest)), 'appKey' in patch ? write(SECRET_KEY, appKey) : null]);
}

export function getSettings(): Settings {
  return current;
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

/** "6:40" → 400 seconds per km, or undefined. */
export function parsePace(text: string): number | undefined {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(text.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
}
