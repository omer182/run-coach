export interface Config {
  port: number;
  /** Shared secret the app sends as `Authorization: Bearer <key>`. */
  appApiKey: string;
  coachModel: string;
  /** Kokoro's OpenAI-compatible base URL; empty disables server-side voice. */
  ttsUrl: string;
  ttsVoice: string;
  dataDir: string;
  publicDir: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const appApiKey = env.APP_API_KEY ?? '';
  if (appApiKey.length < 16) {
    throw new Error('APP_API_KEY must be set to a random string of at least 16 characters');
  }
  return {
    port: Number(env.PORT ?? 3020),
    appApiKey,
    coachModel: env.COACH_MODEL ?? 'claude-haiku-5-5',
    ttsUrl: env.TTS_URL ?? '',
    ttsVoice: env.TTS_VOICE ?? 'af_heart',
    dataDir: env.DATA_DIR ?? './data',
    publicDir: env.PUBLIC_DIR ?? './public',
  };
}
