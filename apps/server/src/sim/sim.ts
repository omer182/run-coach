import {
  WorkoutEngine,
  buildSnapshot,
  coachTriggerFor,
  cueText,
  formatClock,
  formatPace,
  stepName,
  type CoachLineResponse,
  type CoachTrigger,
  type EngineEvent,
  type Workout,
} from '@run-coach/core';

// A stand-in for the phone: fake GPS walks and runs north, the real engine drives the cues,
// and the real server writes and speaks the coach lines.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const num = (id: string) => Number($<HTMLInputElement>(id).value);

const DEG_PER_M = 1 / 111_195;
const T0 = Date.now();
const PERIODIC_SEC = 60;

const keyInput = $<HTMLInputElement>('key');
try {
  keyInput.value = localStorage.getItem('runCoachKey') ?? '';
} catch {}
keyInput.addEventListener('change', () => {
  try {
    localStorage.setItem('runCoachKey', keyInput.value);
  } catch {}
});

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${keyInput.value}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(res.status === 401 ? 'Wrong app key' : `HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ---- Speech: one queue so cues and coach lines never talk over each other.

type Utterance = { kind: 'cue' | 'coach'; text: string; audioUrl?: string };
const queue: Utterance[] = [];
let speaking = false;

function say(u: Utterance) {
  // At high sim speeds lines pile up; stale coach lines are worth less than fresh cues.
  while (queue.length > 2) {
    const i = queue.findIndex(q => q.kind === 'coach');
    queue.splice(i === -1 ? 0 : i, 1);
  }
  queue.push(u);
  if (!speaking) void drain();
}

async function drain() {
  speaking = true;
  for (let u = queue.shift(); u; u = queue.shift()) {
    await (u.audioUrl ? playAudio(u.audioUrl) : speakLocal(u.text, u.kind));
  }
  speaking = false;
}

function speakLocal(text: string, kind: Utterance['kind']): Promise<void> {
  return new Promise(resolve => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = kind === 'cue' ? 1.1 : 1;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}

function playAudio(url: string): Promise<void> {
  return new Promise(resolve => {
    const audio = new Audio(url);
    audio.onended = () => resolve();
    audio.onerror = () => resolve();
    audio.play().catch(() => resolve());
  });
}

// ---- Log

function log(kind: 'cue' | 'coach' | 'info', text: string, extra = '') {
  const li = document.createElement('li');
  li.className = kind;
  const time = document.createElement('span');
  time.className = 'time';
  time.textContent = engine ? formatClock(engine.state().elapsedSec) : '';
  li.append(time, document.createTextNode(text));
  if (extra) {
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = extra;
    li.append(meta);
  }
  $('log').prepend(li);
}

// ---- Run

let engine: WorkoutEngine | null = null;
let workout: Workout | null = null;
let timer: number | undefined;
let simSec = 0;
let lat = 0;
let lastCoachSec = -Infinity;
let coachInFlight = false;
let finalMinuteDone = false;
let lastPaceStatus: 'slow' | 'fast' | 'on_target' | undefined;
const recentLines: string[] = [];

function readWorkout(): Workout {
  const items: Workout['items'] = [];
  if (num('warmup') > 0) items.push({ kind: 'warmup', label: 'Warm up walk', durationSec: num('warmup') * 60 });
  items.push({
    repeat: num('rounds'),
    steps: [
      { kind: 'walk', durationSec: num('walkSec') },
      { kind: 'run', durationSec: num('runSec') },
    ],
  });
  if (num('cooldown') > 0) items.push({ kind: 'cooldown', durationSec: num('cooldown') * 60 });
  return { id: 'sim', name: `Walk ${num('walkSec')}s / run ${num('runSec')}s × ${num('rounds')}`, items };
}

async function askCoach(trigger: CoachTrigger) {
  if (!engine || coachInFlight) return;
  coachInFlight = true;
  lastCoachSec = simSec;
  const snapshot = buildSnapshot(engine.state(), workout, trigger, recentLines, lastPaceStatus);
  const started = performance.now();
  try {
    const res = await api<CoachLineResponse>('/api/coach/line', { method: 'POST', body: JSON.stringify({ snapshot }) });
    recentLines.push(res.text);
    if (recentLines.length > 5) recentLines.shift();
    const ms = Math.round(performance.now() - started);
    log('coach', res.text, `${trigger} · ${ms} ms${res.audioUrl ? '' : ' · browser voice'}`);
    say({ kind: 'coach', text: res.text, audioUrl: res.audioUrl });
  } catch (err) {
    log('info', `Coach unavailable: ${(err as Error).message}`);
  } finally {
    coachInFlight = false;
  }
}

function handle(events: EngineEvent[]) {
  for (const event of events) {
    const cue = cueText(event);
    if (cue) {
      log('cue', cue);
      say({ kind: 'cue', text: cue });
    }
    if (event.type === 'pace') lastPaceStatus = event.status;
    if (event.type === 'step_start') lastPaceStatus = undefined;
    const trigger = coachTriggerFor(event);
    if (trigger) void askCoach(trigger);
  }
}

function step() {
  if (!engine) return;
  simSec += 1;
  const state = engine.state();
  const running = state.step?.kind === 'run' || state.step?.kind === 'fast';
  const kmh = running ? num('runKmh') : num('walkKmh');
  const mps = Math.max(0, (kmh / 3.6) * (1 + (Math.random() - 0.5) * 0.1));
  lat += mps * DEG_PER_M;
  // Rolling hills every 800 m or so.
  const altM = 30 + 12 * Math.sin((state.distanceM / 800) * 2 * Math.PI);
  handle(engine.update({ t: T0 + simSec * 1000, lat, lon: 0, altM, accuracyM: 5 }));

  const after = engine.state();
  if (!finalMinuteDone && after.plannedSec > 0 && after.plannedSec - after.elapsedSec <= 60 && !after.workoutDone) {
    finalMinuteDone = true;
    void askCoach('final_minute');
  } else if (simSec - lastCoachSec >= PERIODIC_SEC) {
    void askCoach('periodic');
  }
  render();
}

function render() {
  if (!engine) return;
  const s = engine.state();
  $('stepName').textContent = s.workoutDone ? 'Free run' : s.step ? stepName(s.step) : '';
  $('stepName').dataset.kind = s.step?.kind ?? '';
  $('stepLeft').textContent = s.stepRemainingSec != null ? formatClock(s.stepRemainingSec) : '–';
  $('round').textContent = s.step?.round ? `Round ${s.step.round} of ${s.step.rounds}` : '';
  $('next').textContent = s.next ? `Next: ${stepName(s.next)}` : '';
  $('elapsed').textContent = formatClock(s.elapsedSec);
  $('distance').textContent = `${(s.distanceM / 1000).toFixed(2)} km`;
  $('pace').textContent = formatPace(s.paceSecPerKm);
  $('climb').textContent = `+${Math.round(s.climbM)} m`;
  const pct = s.plannedSec > 0 ? Math.min(100, (s.elapsedSec / s.plannedSec) * 100) : 0;
  $('progress').style.width = `${pct}%`;
}

function setRunning(on: boolean) {
  clearInterval(timer);
  if (on) timer = window.setInterval(step, 1000 / num('simSpeed'));
  $<HTMLButtonElement>('pause').textContent = on ? 'Pause' : 'Resume';
}

$('start').addEventListener('click', async () => {
  if (!keyInput.value) {
    $('error').textContent = 'Enter the app key first.';
    return;
  }
  $('error').textContent = '';
  setRunning(false);
  speechSynthesis.cancel();
  queue.length = 0;
  $('log').replaceChildren();
  workout = readWorkout();
  engine = new WorkoutEngine(workout);
  simSec = 0;
  lat = 0;
  lastCoachSec = -Infinity;
  finalMinuteDone = false;
  recentLines.length = 0;
  handle(engine.start(T0));
  void askCoach('start');
  render();
  setRunning(true);
  document.body.dataset.running = 'true';
});

$('pause').addEventListener('click', () => {
  if (!engine) return;
  const t = T0 + simSec * 1000;
  if (engine.state().status === 'running') {
    handle(engine.pause(t));
    setRunning(false);
  } else {
    engine.resume(t);
    setRunning(true);
  }
});

$('skip').addEventListener('click', () => {
  if (engine) handle(engine.skipStep(T0 + simSec * 1000));
  render();
});

$('stop').addEventListener('click', () => {
  if (!engine) return;
  handle(engine.stop(T0 + simSec * 1000));
  setRunning(false);
  document.body.dataset.running = 'false';
  log('info', 'Run stopped.');
});

$('simSpeed').addEventListener('change', () => {
  if (engine?.state().status === 'running') setRunning(true);
});

// ---- Profile

$('loadProfile').addEventListener('click', async () => {
  try {
    const p = await api<{ why: string[]; personality: string; name?: string; goal?: string }>('/api/profile');
    $<HTMLInputElement>('name').value = p.name ?? '';
    $<HTMLInputElement>('goal').value = p.goal ?? '';
    $<HTMLTextAreaElement>('why').value = p.why.join('\n');
    $<HTMLSelectElement>('personality').value = p.personality;
    $('profileStatus').textContent = 'Loaded';
  } catch (err) {
    $('profileStatus').textContent = (err as Error).message;
  }
});

$('saveProfile').addEventListener('click', async () => {
  try {
    await api('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({
        name: $<HTMLInputElement>('name').value.trim(),
        goal: $<HTMLInputElement>('goal').value.trim(),
        why: $<HTMLTextAreaElement>('why')
          .value.split('\n')
          .map(w => w.trim())
          .filter(Boolean),
        personality: $<HTMLSelectElement>('personality').value,
      }),
    });
    $('profileStatus').textContent = 'Saved';
  } catch (err) {
    $('profileStatus').textContent = (err as Error).message;
  }
});
