import type { CoachLineResponse, CoachProfile, CoachSnapshot } from '@run-coach/core';
import { getSettings } from './settings';

function base(): string {
  return getSettings().serverUrl.trim().replace(/\/+$/, '');
}

async function call<T>(path: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const { appKey } = getSettings();
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${appKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (res.status === 401) throw new Error('The app key is wrong');
  if (!res.ok) throw new Error(`Server error ${res.status}`);
  return (await res.json()) as T;
}

export function coachConfigured(): boolean {
  const s = getSettings();
  return s.coachEnabled && base().length > 0 && s.appKey.length > 0;
}

export async function requestCoachLine(snapshot: CoachSnapshot): Promise<CoachLineResponse> {
  const res = await call<CoachLineResponse>('/api/coach/line', { method: 'POST', body: JSON.stringify({ snapshot }) });
  // The server returns a relative audio path; the player needs a full URL.
  return { ...res, audioUrl: res.audioUrl ? `${base()}${res.audioUrl}` : undefined };
}

/** Checks the address and the key; returns a short human answer. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  if (!base()) return { ok: false, message: 'Enter the server address first.' };
  try {
    const health = await call<{ ok: boolean; tts: boolean }>('/api/health', {}, 5000);
    await call<CoachProfile>('/api/profile', {}, 5000);
    return { ok: true, message: health.tts ? 'Connected. Coach voice is on.' : 'Connected. Server voice is off; the phone will speak.' };
  } catch (err) {
    const msg = (err as Error).message;
    return { ok: false, message: /abort|timed? ?out/i.test(msg) ? "Can't reach the server. Are you on the same network?" : msg };
  }
}

export const getProfile = () => call<CoachProfile>('/api/profile');
export const saveProfile = (p: CoachProfile) => call<CoachProfile>('/api/profile', { method: 'PUT', body: JSON.stringify(p) });
