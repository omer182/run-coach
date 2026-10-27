import { flatten, isRepeat, plannedDurationSec, type Step, type Workout } from '@run-coach/core';

const warmup: Step = { kind: 'warmup', label: 'Warm up walk', durationSec: 300 };
const cooldown: Step = { kind: 'cooldown', label: 'Cool down walk', durationSec: 300 };

function intervals(id: string, name: string, walkSec: number, runSec: number, rounds: number, runFirst = false): Workout {
  const walk: Step = { kind: 'walk', durationSec: walkSec };
  const run: Step = { kind: 'run', durationSec: runSec };
  return {
    id,
    name,
    items: [warmup, { repeat: rounds, steps: runFirst ? [run, walk] : [walk, run] }, cooldown],
  };
}

/** Built-in workouts, easiest first. */
export const PRESETS: Workout[] = [
  intervals('wr-1-1', 'Walk 1 / run 1', 60, 60, 10),
  intervals('wr-1-2', 'Walk 1 / run 2', 60, 120, 7),
  intervals('rw-3-1', 'Run 3 / walk 1', 60, 180, 5, true),
  intervals('rw-5-1', 'Run 5 / walk 1', 60, 300, 4, true),
  {
    id: 'reps-400',
    name: '400 m repeats',
    items: [
      warmup,
      {
        repeat: 6,
        steps: [
          { kind: 'fast', distanceM: 400 },
          { kind: 'walk', durationSec: 90 },
        ],
      },
      cooldown,
    ],
  },
];

/** A workout with the shape of the simple builder: warmup, N × (walk, run), cooldown. */
export interface SimpleIntervals {
  name: string;
  warmupMin: number;
  walkSec: number;
  runSec: number;
  rounds: number;
  cooldownMin: number;
}

export function fromSimple(s: SimpleIntervals, id: string): Workout {
  const items: Workout['items'] = [];
  if (s.warmupMin > 0) items.push({ ...warmup, durationSec: s.warmupMin * 60 });
  items.push({
    repeat: s.rounds,
    steps: [
      { kind: 'walk', durationSec: s.walkSec },
      { kind: 'run', durationSec: s.runSec },
    ],
  });
  if (s.cooldownMin > 0) items.push({ ...cooldown, durationSec: s.cooldownMin * 60 });
  return { id, name: s.name, items };
}

/** "10 × walk 1:00 / run 1:00" style one-liner for lists. */
export function describeWorkout(w: Workout): string {
  const block = w.items.find(isRepeat);
  if (!block) return `${flatten(w).length} steps`;
  const part = (s: Step) =>
    `${s.kind === 'fast' ? 'fast' : s.kind} ${s.durationSec != null ? formatShort(s.durationSec) : `${s.distanceM} m`}`;
  return `${block.repeat} × ${block.steps.map(part).join(' / ')}`;
}

export function workoutMinutes(w: Workout): number {
  return Math.round(plannedDurationSec(w) / 60);
}

function formatShort(sec: number): string {
  return sec % 60 === 0 ? `${sec / 60} min` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
