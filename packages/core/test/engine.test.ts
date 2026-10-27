import { describe, expect, it } from 'vitest';
import {
  WorkoutEngine,
  buildSnapshot,
  cueText,
  flatten,
  plannedDurationSec,
  walkRun1to1,
  type EngineEvent,
  type LocationSample,
  type Workout,
} from '../src';

const T0 = 1_700_000_000_000;
// About 1 m of latitude.
const DEG_PER_M = 1 / 111_195;

/** Runs north at a steady speed, one sample per second, collecting every event. */
function simulate(engine: WorkoutEngine, seconds: number, mps: number, startSec = 0) {
  const events: EngineEvent[] = [];
  for (let s = startSec; s <= startSec + seconds; s++) {
    const sample: LocationSample = { t: T0 + s * 1000, lat: s * mps * DEG_PER_M, lon: 0, accuracyM: 5 };
    events.push(...engine.update(sample));
  }
  return events;
}

describe('flatten', () => {
  it('expands repeat blocks with round numbers', () => {
    const steps = flatten(walkRun1to1);
    expect(steps).toHaveLength(22);
    expect(steps[1]).toMatchObject({ kind: 'walk', round: 1, rounds: 10 });
    expect(steps[20]).toMatchObject({ kind: 'run', round: 10, rounds: 10 });
    expect(steps[21]!.kind).toBe('cooldown');
    expect(plannedDurationSec(walkRun1to1)).toBe(30 * 60);
  });
});

describe('WorkoutEngine', () => {
  it('moves through time-based steps on exact boundaries', () => {
    const engine = new WorkoutEngine(walkRun1to1);
    const startEvents = engine.start(T0);
    expect(startEvents[0]).toMatchObject({ type: 'step_start', step: { kind: 'warmup' } });

    const events = simulate(engine, 360, 1.4);
    const starts = events.filter(e => e.type === 'step_start');
    expect(starts.map(e => e.type === 'step_start' && e.step.kind)).toEqual(['walk', 'run']);
    expect(engine.state()).toMatchObject({ stepIndex: 2, stepRemainingSec: 60 });
  });

  it('counts down 3, 2, 1 before each step ends', () => {
    const engine = new WorkoutEngine(walkRun1to1);
    engine.start(T0);
    const events = simulate(engine, 300, 1.4);
    const countdown = events.filter(e => e.type === 'countdown').map(e => e.type === 'countdown' && e.secondsLeft);
    expect(countdown).toEqual([3, 2, 1]);
  });

  it('finishes the workout and keeps recording', () => {
    const engine = new WorkoutEngine(walkRun1to1);
    engine.start(T0);
    const events = simulate(engine, 31 * 60, 2);
    expect(events.filter(e => e.type === 'workout_complete')).toHaveLength(1);
    expect(events.filter(e => e.type === 'halfway')).toHaveLength(1);
    const state = engine.state();
    expect(state.workoutDone).toBe(true);
    expect(state.status).toBe('running');
    expect(state.distanceM).toBeGreaterThan(3600);
  });

  it('ends distance-based steps by distance', () => {
    const reps: Workout = {
      id: 'reps',
      name: '200 m reps',
      items: [{ repeat: 2, steps: [{ kind: 'fast', distanceM: 200 }, { kind: 'rest', durationSec: 30 }] }],
    };
    const engine = new WorkoutEngine(reps);
    engine.start(T0);
    // 200 m at 4 m/s = 50 s, then 30 s rest.
    const events = simulate(engine, 90, 4);
    const kinds = events.filter(e => e.type === 'step_start').map(e => e.type === 'step_start' && e.step.kind);
    expect(kinds).toEqual(['rest', 'fast']);
  });

  it('emits km splits', () => {
    const engine = new WorkoutEngine(null);
    engine.start(T0);
    const events = simulate(engine, 700, 3);
    const splits = events.filter(e => e.type === 'km_split');
    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({ km: 1 });
    if (splits[0]?.type === 'km_split') expect(splits[0].splitSec).toBeCloseTo(333, -1);
  });

  it('ignores inaccurate samples and GPS jumps', () => {
    const engine = new WorkoutEngine(null);
    engine.start(T0);
    engine.update({ t: T0, lat: 0, lon: 0, accuracyM: 5 });
    engine.update({ t: T0 + 1000, lat: 3 * DEG_PER_M, lon: 0, accuracyM: 80 });
    engine.update({ t: T0 + 2000, lat: 500 * DEG_PER_M, lon: 0, accuracyM: 5 });
    expect(engine.state().distanceM).toBe(0);
  });

  it('does not count time or distance while paused', () => {
    const engine = new WorkoutEngine(null);
    engine.start(T0);
    simulate(engine, 60, 3);
    engine.pause(T0 + 60_000);
    engine.resume(T0 + 600_000);
    simulate(engine, 60, 3, 600);
    const state = engine.state();
    expect(state.elapsedSec).toBeCloseTo(120, 0);
    expect(state.distanceM).toBeCloseTo(360, -1);
  });

  it('warns when off pace, without nagging every second', () => {
    const tempo: Workout = {
      id: 'tempo',
      name: 'Tempo',
      items: [{ kind: 'run', durationSec: 300, pace: { minSecPerKm: 300, maxSecPerKm: 330 } }],
    };
    const engine = new WorkoutEngine(tempo);
    engine.start(T0);
    // 2.5 m/s = 6:40 /km, slower than target.
    const events = simulate(engine, 120, 2.5);
    const pace = events.filter(e => e.type === 'pace');
    expect(pace.length).toBeGreaterThanOrEqual(1);
    expect(pace.length).toBeLessThanOrEqual(3);
    expect(pace[0]).toMatchObject({ status: 'slow' });
  });

  it('tracks climb with a threshold so barometer noise is ignored', () => {
    const engine = new WorkoutEngine(null);
    engine.start(T0);
    const alts = [10, 10.5, 9.8, 10.4, 13, 15, 14.5, 11];
    alts.forEach((altM, i) => engine.update({ t: T0 + i * 1000, lat: 0, lon: 0, altM, accuracyM: 5 }));
    expect(engine.state().climbM).toBe(5);
    expect(engine.state().descentM).toBe(4);
  });
});

describe('cues and snapshots', () => {
  it('speaks round and step names', () => {
    const [, second] = flatten(walkRun1to1);
    expect(cueText({ type: 'step_start', step: { ...second!, kind: 'run' } })).toBe('Round 1 of 10. Run! 1 minute.');
    expect(cueText({ type: 'countdown', secondsLeft: 2 })).toBe('2');
  });

  it('builds a compact snapshot for the coach', () => {
    const engine = new WorkoutEngine(walkRun1to1);
    engine.start(T0);
    simulate(engine, 400, 1.8);
    const snap = buildSnapshot(engine.state(), walkRun1to1, 'periodic', ['a', 'b']);
    expect(snap).toMatchObject({
      trigger: 'periodic',
      workoutName: 'Walk/run 1:1',
      elapsed: '6:40',
      plannedTotal: '30:00',
      step: { name: 'Run', round: 1, rounds: 10, remaining: '0:20' },
      next: 'Walk',
      recentLines: ['a', 'b'],
    });
  });
});
