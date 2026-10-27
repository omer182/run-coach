import { describe, expect, it } from 'vitest';
import {
  RunController,
  replayRun,
  type CoachLineResponse,
  type CoachSnapshot,
  type RunPorts,
  type RunRecord,
  type RunState,
  type StoredControl,
  type StoredPoint,
  type Workout,
} from '../src';

const T0 = 1_700_000_000_000;
const DEG_PER_M = 1 / 111_195;

const workout: Workout = {
  id: 'w',
  name: 'Walk/run 1:1 × 3',
  items: [
    { kind: 'warmup', label: 'Warm up walk', durationSec: 60 },
    {
      repeat: 3,
      steps: [
        { kind: 'walk', durationSec: 60 },
        { kind: 'run', durationSec: 60 },
      ],
    },
  ],
};

const settle = () => new Promise(r => setTimeout(r, 0));

function fakePorts(coach: RunPorts['coach'] = async () => ({ text: 'Nice work.' })) {
  let now = T0;
  let id = 0;
  const db = {
    runs: new Map<string, RunRecord>(),
    points: new Map<string, StoredPoint[]>(),
    controls: new Map<string, StoredControl[]>(),
    finished: new Map<string, RunState>(),
  };
  const cues: string[] = [];
  const coachLines: string[] = [];
  const coachCalls: CoachSnapshot[] = [];
  const ports: RunPorts = {
    now: () => now,
    newId: () => `run-${++id}`,
    speakCue: t => cues.push(t),
    speakCoach: t => coachLines.push(t),
    coach:
      coach &&
      (async snap => {
        coachCalls.push(snap);
        return coach(snap);
      }),
    store: {
      createRun: async r => void db.runs.set(r.id, r),
      appendPoints: async (runId, pts) => void db.points.set(runId, [...(db.points.get(runId) ?? []), ...pts]),
      appendControl: async (runId, c) => void db.controls.set(runId, [...(db.controls.get(runId) ?? []), c]),
      finishRun: async (runId, _t, state) => void db.finished.set(runId, state),
    },
  };
  return {
    ports,
    db,
    cues,
    coachLines,
    coachCalls,
    setNow: (t: number) => (now = t),
    getNow: () => now,
  };
}

/** Moves north at `mps` for `seconds`, one GPS sample a second, starting after the current clock. */
function runFor(c: RunController, f: ReturnType<typeof fakePorts>, seconds: number, mps: number, lat0 = { lat: 0 }) {
  for (let i = 0; i < seconds; i++) {
    f.setNow(f.getNow() + 1000);
    lat0.lat += mps * DEG_PER_M;
    c.onLocations([{ t: f.getNow(), lat: lat0.lat, lon: 0, altM: 20, accuracyM: 5 }]);
  }
}

describe('RunController', () => {
  it('runs a whole workout: cues, coach lines, saved points', async () => {
    const f = fakePorts();
    const c = new RunController(f.ports);
    const runId = await c.start(workout);
    const pos = { lat: 0 };
    for (let i = 0; i < 7 * 60 + 5; i++) {
      runFor(c, f, 1, 2, pos);
      await settle();
    }
    await c.stop();

    expect(f.cues[0]).toBe('Warm up walk. 1 minute.');
    expect(f.cues).toContain('Round 1 of 3. Walk. 1 minute.');
    expect(f.cues).toContain('Round 3 of 3. Run! 1 minute.');
    expect(f.cues.filter(t => t === '3')).toHaveLength(7);
    expect(f.cues).toContain('Workout complete. Great job.');
    expect(f.cues.at(-1)).toMatch(/^Run saved\. 0\.8\d kilometers\.$/);

    expect(f.coachCalls[0]?.trigger).toBe('start');
    expect(f.coachCalls.map(s => s.trigger)).toContain('step_start');
    expect(f.coachCalls.map(s => s.trigger)).toContain('workout_complete');
    expect(f.coachLines.length).toBe(f.coachCalls.length);

    expect(f.db.points.get(runId)).toHaveLength(7 * 60 + 5);
    expect(f.db.finished.get(runId)?.distanceM).toBeGreaterThan(800);
    expect(c.active).toBe(false);
  });

  it('keeps running on cues alone when the coach is unreachable', async () => {
    const f = fakePorts(async () => {
      throw new Error('Network request failed');
    });
    const c = new RunController(f.ports);
    await c.start(workout);
    runFor(c, f, 130, 2);
    await settle();
    expect(f.cues).toContain('Round 1 of 3. Walk. 1 minute.');
    expect(f.coachLines).toEqual([]);
    expect(c.getSnapshot().log.some(l => l.kind === 'error')).toBe(true);
  });

  it('works with no coach configured at all', async () => {
    const f = fakePorts(null);
    const c = new RunController(f.ports);
    await c.start(workout);
    runFor(c, f, 130, 2);
    await settle();
    expect(f.coachCalls).toEqual([]);
    expect(f.cues.length).toBeGreaterThan(3);
  });

  it('asks the coach one thing at a time', async () => {
    let release!: (r: CoachLineResponse) => void;
    const f = fakePorts(() => new Promise(r => (release = r)));
    const c = new RunController(f.ports);
    await c.start(workout);
    // Several triggers fire while the first request is still out.
    runFor(c, f, 130, 2);
    expect(f.coachCalls).toHaveLength(1);
    expect(c.getSnapshot().coachBusy).toBe(true);
    release({ text: 'Hi' });
    await settle();
    expect(c.getSnapshot().coachBusy).toBe(false);
  });

  it('drops a coach line that arrives after the run stopped', async () => {
    let release!: (r: CoachLineResponse) => void;
    const f = fakePorts(() => new Promise(r => (release = r)));
    const c = new RunController(f.ports);
    await c.start(workout);
    await c.stop();
    release({ text: 'Too late' });
    await settle();
    expect(f.coachLines).toEqual([]);
  });

  it('asks for a periodic line after a quiet minute, and the final-minute push once', async () => {
    const f = fakePorts();
    const free: Workout = { id: 'f', name: 'Steady 3 min', items: [{ kind: 'run', durationSec: 180 }] };
    const c = new RunController(f.ports, { periodicSec: 60 });
    await c.start(free);
    for (let i = 0; i < 175; i++) {
      runFor(c, f, 1, 2.5);
      await settle();
    }
    const triggers = f.coachCalls.map(s => s.trigger);
    expect(triggers.filter(t => t === 'periodic').length).toBeGreaterThanOrEqual(1);
    expect(triggers.filter(t => t === 'final_minute')).toHaveLength(1);
  });

  it('does not count distance or time while paused, and saves the controls', async () => {
    const f = fakePorts(null);
    const c = new RunController(f.ports);
    const runId = await c.start(null);
    const pos = { lat: 0 };
    runFor(c, f, 60, 2, pos);
    c.pause();
    // Walking to the shop while paused.
    runFor(c, f, 300, 1.5, pos);
    c.resume();
    runFor(c, f, 60, 2, pos);
    await c.stop();
    const state = f.db.finished.get(runId)!;
    expect(state.elapsedSec).toBeCloseTo(120, -1);
    expect(state.distanceM).toBeCloseTo(240, -1);
    expect(f.db.controls.get(runId)?.map(x => x.kind)).toEqual(['pause', 'resume']);
    expect(f.cues).toContain('Paused.');
  });

  it('skips a step on request', async () => {
    const f = fakePorts(null);
    const c = new RunController(f.ports);
    await c.start(workout);
    runFor(c, f, 10, 1.5);
    c.skip();
    expect(c.getSnapshot().state?.step?.kind).toBe('walk');
    expect(f.cues).toContain('Round 1 of 3. Walk. 1 minute.');
  });

  it('recovers an interrupted run from storage, paused, and carries on', async () => {
    const f = fakePorts(null);
    const first = new RunController(f.ports);
    const runId = await first.start(workout);
    const pos = { lat: 0 };
    runFor(first, f, 150, 2, pos);
    first.flush();
    await settle();
    const before = first.getSnapshot().state!;

    // The app is killed. Ten minutes later it relaunches.
    f.setNow(f.getNow() + 10 * 60_000);
    const second = new RunController(f.ports);
    second.restore(f.db.runs.get(runId)!, f.db.points.get(runId)!, f.db.controls.get(runId) ?? []);
    const restored = second.getSnapshot().state!;
    expect(restored.status).toBe('paused');
    expect(restored.distanceM).toBeCloseTo(before.distanceM, 0);
    expect(restored.stepIndex).toBe(before.stepIndex);
    expect(restored.elapsedSec).toBeCloseTo(before.elapsedSec, 0);

    second.resume();
    runFor(second, f, 30, 2, pos);
    await second.stop();
    // The dead ten minutes didn't count.
    expect(f.db.finished.get(runId)!.elapsedSec).toBeCloseTo(180, -1);
  });

  it('rebuilds the same per-round stats from storage for the summary', async () => {
    const f = fakePorts(null);
    const c = new RunController(f.ports);
    const runId = await c.start(workout);
    runFor(c, f, 7 * 60 + 5, 2);
    await c.stop();
    const engine = replayRun(f.db.runs.get(runId)!, f.db.points.get(runId)!, f.db.controls.get(runId) ?? []);
    expect(engine.state().stepStats).toHaveLength(7);
    expect(engine.state().distanceM).toBeCloseTo(f.db.finished.get(runId)!.distanceM, 0);
  });

  it('refuses to start a second run while one is going', async () => {
    const f = fakePorts(null);
    const c = new RunController(f.ports);
    await c.start(null);
    await expect(c.start(null)).rejects.toThrow('already in progress');
  });
});
