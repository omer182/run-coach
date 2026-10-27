import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CoachSnapshot } from '@run-coach/core';
import { createApp } from '../src/app';
import { ProfileStore } from '../src/profile';
import { AudioStore } from '../src/tts';

const KEY = 'test-key-0123456789abcdef';

const snapshot: CoachSnapshot = {
  trigger: 'step_start',
  elapsed: '6:00',
  distanceKm: 0.9,
  pace: '6:40',
  avgPace: '6:50',
  climbM: 3,
  recentLines: [],
  step: { name: 'Run', kind: 'run', round: 1, rounds: 10, remaining: '1:00' },
};

async function setup(opts: { coachFails?: boolean; withSpeaker?: boolean } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'run-coach-'));
  const seen: { why: string[] }[] = [];
  const app = createApp({
    appApiKey: KEY,
    coach: {
      async write(_snap, profile) {
        seen.push(profile);
        if (opts.coachFails) throw new Error('boom');
        return 'Nice start, keep it smooth.';
      },
    },
    speaker: opts.withSpeaker ? { speak: async () => Buffer.from('mp3') } : null,
    audio: new AudioStore(),
    profiles: new ProfileStore(dir),
    log: () => {},
  });
  const call = (p: string, init: RequestInit = {}, key = KEY) =>
    app.request(p, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  return { app, call, seen };
}

describe('server', () => {
  it('rejects requests without the app key', async () => {
    const { call } = await setup();
    const res = await call('/api/coach/line', { method: 'POST', body: '{}' }, 'wrong-key');
    expect(res.status).toBe(401);
  });

  it('returns a coach line with an audio url', async () => {
    const { app, call } = await setup({ withSpeaker: true });
    const res = await call('/api/coach/line', { method: 'POST', body: JSON.stringify({ snapshot }) });
    const body = (await res.json()) as { text: string; audioUrl: string };
    expect(body.text).toBe('Nice start, keep it smooth.');
    const audio = await app.request(body.audioUrl);
    expect(audio.headers.get('Content-Type')).toBe('audio/mpeg');
  });

  it('falls back to a canned line when the coach fails', async () => {
    const { call } = await setup({ coachFails: true });
    const res = await call('/api/coach/line', { method: 'POST', body: JSON.stringify({ snapshot }) });
    const body = (await res.json()) as { text: string; audioUrl?: string };
    expect(body.text.length).toBeGreaterThan(5);
    expect(body.audioUrl).toBeUndefined();
  });

  it('rejects an unknown trigger', async () => {
    const { call } = await setup();
    const res = await call('/api/coach/line', {
      method: 'POST',
      body: JSON.stringify({ snapshot: { ...snapshot, trigger: 'nope' } }),
    });
    expect(res.status).toBe(400);
  });

  it('saves the profile and passes it to the coach', async () => {
    const { call, seen } = await setup();
    await call('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ why: ['Run a 5K with my kids'], personality: 'friendly' }),
    });
    await call('/api/coach/line', { method: 'POST', body: JSON.stringify({ snapshot }) });
    expect(seen[0]?.why).toEqual(['Run a 5K with my kids']);
  });
});
