import { flatten, haversineM, replayRun, type RunState, type StepKind, type StoredControl, type StoredPoint } from '@run-coach/core';
import type { RunRow } from './services/dbTypes';
import { runRecord } from './services/dbTypes';

export interface RouteSegment {
  kind: StepKind | undefined;
  coords: { latitude: number; longitude: number }[];
}

export interface RunSummary {
  state: RunState;
  segments: RouteSegment[];
  elevation: { distanceM: number; altM: number }[];
  rounds: { round: number; walk: number | null; run: number | null }[];
}

/** Everything the summary screen draws, rebuilt from the saved points by the same engine that ran it. */
export function summarize(run: RunRow, points: StoredPoint[], controls: StoredControl[]): RunSummary {
  const state = replayRun(runRecord(run), points, controls).state();
  const steps = run.workout ? flatten(run.workout) : [];

  // Route split wherever the step changes, so walk and run get their own colours.
  const segments: RouteSegment[] = [];
  for (const p of points) {
    const kind = steps[p.stepIndex]?.kind;
    const last = segments[segments.length - 1];
    const coord = { latitude: p.lat, longitude: p.lon };
    if (!last || last.kind !== kind) {
      // Start the new segment at the previous point so the line has no gaps.
      const prev = last?.coords[last.coords.length - 1];
      segments.push({ kind, coords: prev ? [prev, coord] : [coord] });
    } else {
      last.coords.push(coord);
    }
  }

  // Elevation against distance, thinned to about 200 points.
  const elevation: RunSummary['elevation'] = [];
  let d = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const prev = points[i - 1];
    if (prev) d += haversineM(prev.lat, prev.lon, p.lat, p.lon);
    if (p.altM != null) elevation.push({ distanceM: d, altM: p.altM });
  }
  const every = Math.max(1, Math.ceil(elevation.length / 200));
  const thinned = elevation.filter((_, i) => i % every === 0 || i === elevation.length - 1);

  const byRound = new Map<number, { round: number; walk: number | null; run: number | null }>();
  for (const s of state.stepStats) {
    if (s.round == null) continue;
    const r = byRound.get(s.round) ?? { round: s.round, walk: null, run: null };
    if (s.kind === 'run' || s.kind === 'fast') r.run = s.paceSecPerKm;
    else r.walk = s.paceSecPerKm;
    byRound.set(s.round, r);
  }

  return { state, segments, elevation: thinned, rounds: [...byRound.values()] };
}
