import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app';
import { ClaudeCoach } from './coach';
import { loadConfig } from './config';
import { ProfileStore } from './profile';
import { AudioStore, KokoroSpeaker } from './tts';

const config = loadConfig();

const app = createApp({
  appApiKey: config.appApiKey,
  coach: new ClaudeCoach(config.coachModel),
  speaker: config.ttsUrl ? new KokoroSpeaker(config.ttsUrl, config.ttsVoice) : null,
  audio: new AudioStore(),
  profiles: new ProfileStore(config.dataDir),
});

// The run simulator page and anything else static.
app.use('/*', serveStatic({ root: config.publicDir }));

serve({ fetch: app.fetch, port: config.port }, info => {
  console.log(`run-coach server on :${info.port} (model ${config.coachModel}, tts ${config.ttsUrl || 'off'})`);
});
