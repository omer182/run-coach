import { timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import type { CoachLineResponse, CoachSnapshot, CoachTrigger } from '@run-coach/core';
import { fallbackLine, type CoachWriter } from './coach';
import { parseProfile, type ProfileStore } from './profile';
import type { AudioStore, Speaker } from './tts';

export interface AppDeps {
  appApiKey: string;
  coach: CoachWriter;
  speaker: Speaker | null;
  audio: AudioStore;
  profiles: ProfileStore;
  log?: (msg: string) => void;
}

const TRIGGERS = new Set<CoachTrigger>([
  'start',
  'periodic',
  'step_start',
  'km_split',
  'halfway',
  'pace',
  'final_minute',
  'workout_complete',
]);

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createApp(deps: AppDeps): Hono {
  const log = deps.log ?? console.log;
  const app = new Hono();

  app.get('/api/health', c => c.json({ ok: true, tts: deps.speaker != null }));

  // Clip ids are random UUIDs, so the audio route needs no key; <audio> tags can't send headers.
  app.get('/api/audio/:id', c => {
    const clip = deps.audio.get(c.req.param('id'));
    if (!clip) return c.notFound();
    return c.body(new Uint8Array(clip), 200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'private, max-age=600' });
  });

  app.use('/api/*', async (c, next) => {
    const auth = c.req.header('Authorization') ?? '';
    const key = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!sameSecret(key, deps.appApiKey)) return c.json({ error: 'unauthorized' }, 401);
    await next();
  });

  app.get('/api/profile', async c => c.json(await deps.profiles.get()));

  app.put('/api/profile', async c => {
    const profile = parseProfile(await c.req.json().catch(() => null));
    if (!profile) return c.json({ error: 'invalid profile' }, 400);
    await deps.profiles.set(profile);
    return c.json(profile);
  });

  app.post('/api/coach/line', async c => {
    const body = (await c.req.json().catch(() => null)) as { snapshot?: CoachSnapshot } | null;
    const snapshot = body?.snapshot;
    if (!snapshot || !TRIGGERS.has(snapshot.trigger)) return c.json({ error: 'invalid snapshot' }, 400);

    const profile = await deps.profiles.get();
    const started = Date.now();
    let text: string;
    try {
      text = await deps.coach.write(snapshot, profile);
    } catch (err) {
      log(`coach failed, using fallback: ${(err as Error).message}`);
      text = fallbackLine(snapshot.trigger);
    }

    const response: CoachLineResponse = { text };
    if (deps.speaker) {
      try {
        response.audioUrl = `/api/audio/${deps.audio.put(await deps.speaker.speak(text))}`;
      } catch (err) {
        // The phone falls back to its own voice when there's no audio.
        log(`tts failed: ${(err as Error).message}`);
      }
    }
    log(`coach ${snapshot.trigger} ${Date.now() - started}ms: ${text}`);
    return c.json(response);
  });

  return app;
}
