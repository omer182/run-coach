import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

// One queue for everything spoken, so cues and coach lines never talk over each other.

type Item = { kind: 'cue' | 'coach'; text: string; audioUrl?: string };

const queue: Item[] = [];
let draining = false;

export async function prepareAudio(): Promise<void> {
  try {
    // Lower the runner's music while the coach talks, and keep talking with the screen locked.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: true, interruptionMode: 'duckOthers' });
  } catch {
    // Not supported on web; nothing to set up there.
  }
}

export function speakCue(text: string): void {
  enqueue({ kind: 'cue', text });
}

export function speakCoach(text: string, audioUrl?: string): void {
  enqueue({ kind: 'coach', text, audioUrl });
}

export function stopSpeaking(): void {
  queue.length = 0;
  void Speech.stop();
}

function enqueue(item: Item): void {
  // A coach line that waited behind several cues is stale; cues are never dropped.
  while (queue.length > 2) {
    const i = queue.findIndex(q => q.kind === 'coach');
    if (i === -1) break;
    queue.splice(i, 1);
  }
  queue.push(item);
  if (!draining) void drain();
}

async function drain(): Promise<void> {
  draining = true;
  for (let item = queue.shift(); item; item = queue.shift()) {
    try {
      if (item.audioUrl) await playClip(item.audioUrl);
      else await say(item.text, item.kind === 'cue' ? 1.05 : 1);
    } catch {
      // A failed clip falls back to the phone's own voice.
      if (item.audioUrl) await say(item.text, 1).catch(() => {});
    }
  }
  draining = false;
}

function say(text: string, rate: number): Promise<void> {
  return new Promise(resolve => {
    // Callbacks can go missing when the app is backgrounded; never let the queue stall.
    const guard = setTimeout(resolve, 1500 + text.split(/\s+/).length * 450);
    const done = () => {
      clearTimeout(guard);
      resolve();
    };
    Speech.speak(text, {
      language: 'en-US',
      rate,
      // A separate iOS audio session that ducks music by itself while speaking.
      useApplicationAudioSession: false,
      onDone: done,
      onStopped: done,
      onError: done,
    });
  });
}

async function playClip(url: string): Promise<void> {
  await setIsAudioActiveAsync(true).catch(() => {});
  const player = createAudioPlayer(url);
  try {
    await new Promise<void>((resolve, reject) => {
      const guard = setTimeout(resolve, 20_000);
      const sub = player.addListener('playbackStatusUpdate', status => {
        if (status.didJustFinish) {
          clearTimeout(guard);
          sub.remove();
          resolve();
        }
      });
      try {
        player.play();
      } catch (err) {
        clearTimeout(guard);
        sub.remove();
        reject(err);
      }
    });
  } finally {
    player.remove();
    // Give the music its volume back between lines.
    if (queue.length === 0) await setIsAudioActiveAsync(false).catch(() => {});
  }
}
