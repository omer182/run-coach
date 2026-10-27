import { describe, expect, it } from 'vitest';
import { WorkoutEngine, buildSnapshot, type EngineEvent, type EngineOptions, type Trend, type Workout } from '../src';

const T0 = 1_700_000_000_000;
const DEG_PER_M = 1 / 111_195;

const intervals: Workout = {
  id: 'wr',
  name: 'Walk/run 1:1 × 8',
  items: [
    {
      repeat: 8,
      steps: [
        { kind: 'walk', durationSec: 60 },
        { kind: 'run', durationSec: 60 },
      ],
    },
  ],
};

interface Ctx {
  kind: string;
  round: number;
}

/**
 * Runs the whole workout with speed (m/s) and altitude chosen per step, one sample a second.
 * Returns only the trend events.
 */
function runWorkout(
  speed: (c: Ctx) => number,
  options: EngineOptions = {},
  altitude: (c: Ctx, distanceM: number) => number = () => 20,
) {
  const engine = new WorkoutEngine(intervals, options);
  engine.start(T0);
  let lat = 0;
  const trends: Trend[] = [];
  for (let s = 1; s <= 8 * 120; s++) {
    const st = engine.state();
    const ctx = { kind: st.step?.kind ?? 'walk', round: st.step?.round ?? 0 };
    lat += speed(ctx) * DEG_PER_M;
    const events: EngineEvent[] = engine.update({
      t: T0 + s * 1000,
      lat,
      lon: 0,
      altM: altitude(ctx, st.distanceM),
      accuracyM: 5,
    });
    for (const e of events) if (e.type === 'trend') trends.push(e);
  }
  return { trends, engine };
}

const WALK = 1.5; // 5.4 km/h
const RUN = 2.5; // 6:40 /km

describe('trend detection', () => {
  it('stays quiet when the runner is steady', () => {
    const { trends } = runWorkout(c => (c.kind === 'run' ? RUN : WALK));
    expect(trends).toEqual([]);
  });

  it('notices fading in later run rounds, once', () => {
    // Rounds 5-8 run 20% slower.
    const { trends } = runWorkout(c => (c.kind === 'run' ? (c.round >= 5 ? RUN * 0.8 : RUN) : WALK));
    const fading = trends.filter(t => t.kind === 'fading');
    expect(fading.length).toBeGreaterThanOrEqual(1);
    // Rate-limited: not every round.
    expect(fading.length).toBeLessThanOrEqual(2);
    expect(fading[0]!.step.round).toBe(5);
    expect(fading[0]!.delta).toBeGreaterThan(0.2);
  });

  it('says when the runner is back on pace after fading', () => {
    const { trends } = runWorkout(c => (c.kind === 'run' ? (c.round === 5 ? RUN * 0.8 : RUN) : WALK));
    expect(trends.map(t => t.kind)).toEqual(['fading', 'back_on_pace']);
  });

  it('warns about going out too fast against the usual pace', () => {
    // Usual 6:40 /km; first rounds at 5:33 /km.
    const { trends } = runWorkout(c => (c.kind === 'run' ? (c.round <= 2 ? RUN * 1.2 : RUN) : WALK), {
      usualRunPaceSecPerKm: 400,
    });
    expect(trends[0]).toMatchObject({ kind: 'too_fast', step: { round: 1 } });
  });

  it('flags walk steps that are too fast to recover', () => {
    // 7.6 km/h "walking".
    const { trends } = runWorkout(c => (c.kind === 'run' ? RUN : 2.1));
    expect(trends[0]?.kind).toBe('not_recovering');
  });

  it('treats slowing on a climb as uphill, not fading', () => {
    // Round 6 run is slower but climbs about 8% the whole way.
    let climbStart: number | null = null;
    const { trends } = runWorkout(
      c => (c.kind === 'run' ? (c.round === 6 ? RUN * 0.8 : RUN) : WALK),
      {},
      (c, d) => {
        if (c.kind === 'run' && c.round === 6) {
          climbStart ??= d;
          return 20 + (d - climbStart) * 0.08;
        }
        return climbStart == null ? 20 : 20 + 120 * 0.8 * 0.08;
      },
    );
    expect(trends.map(t => t.kind)).toContain('uphill');
    expect(trends.map(t => t.kind)).not.toContain('fading');
  });

  it('puts per-round paces and the trend in the coach snapshot', () => {
    const { engine } = runWorkout(c => (c.kind === 'run' ? (c.round >= 7 ? RUN * 0.8 : RUN) : WALK));
    const state = engine.state();
    const snap = buildSnapshot(state, intervals, 'trend', { trend: state.lastTrend });
    expect(snap.rounds).toHaveLength(6);
    expect(snap.rounds?.[0]).toEqual({ round: 3, walk: '11:07', run: '6:40' });
    expect(snap.trend).toMatchObject({ kind: 'fading', round: 7, baseline: '6:40', vsBaseline: '25% slower' });
  });
});
