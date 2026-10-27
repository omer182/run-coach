import { randomUUID } from 'node:crypto';

export interface Speaker {
  speak(text: string): Promise<Buffer>;
}

/** Kokoro-FastAPI, which speaks the OpenAI `/v1/audio/speech` API. */
export class KokoroSpeaker implements Speaker {
  constructor(
    private readonly baseUrl: string,
    private readonly voice: string,
  ) {}

  async speak(text: string): Promise<Buffer> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'kokoro', input: text, voice: this.voice, response_format: 'mp3' }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status} ${await res.text()}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

/** Recent clips held in memory just long enough for the phone to fetch them. */
export class AudioStore {
  private readonly clips = new Map<string, Buffer>();

  constructor(private readonly maxClips = 200) {}

  put(audio: Buffer): string {
    const id = randomUUID();
    this.clips.set(id, audio);
    if (this.clips.size > this.maxClips) {
      const oldest = this.clips.keys().next().value;
      if (oldest) this.clips.delete(oldest);
    }
    return id;
  }

  get(id: string): Buffer | undefined {
    return this.clips.get(id);
  }
}
