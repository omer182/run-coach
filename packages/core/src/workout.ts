export type StepKind = 'warmup' | 'walk' | 'run' | 'easy' | 'fast' | 'rest' | 'cooldown';

/** Pace range in seconds per km; `min` is the faster end. */
export interface PaceTarget {
  minSecPerKm: number;
  maxSecPerKm: number;
}

/** One step of a workout. It ends after `durationSec` or `distanceM`, whichever is set. */
export interface Step {
  kind: StepKind;
  label?: string;
  durationSec?: number;
  distanceM?: number;
  pace?: PaceTarget;
}

export interface RepeatBlock {
  repeat: number;
  steps: Step[];
}

export type WorkoutItem = Step | RepeatBlock;

export interface Workout {
  id: string;
  name: string;
  items: WorkoutItem[];
}

/** A step after repeat blocks are expanded, in the order it will be run. */
export interface FlatStep extends Step {
  index: number;
  /** 1-based round inside its repeat block, when it came from one. */
  round?: number;
  rounds?: number;
}

export function isRepeat(item: WorkoutItem): item is RepeatBlock {
  return 'repeat' in item;
}

export function flatten(workout: Workout): FlatStep[] {
  const out: FlatStep[] = [];
  for (const item of workout.items) {
    if (isRepeat(item)) {
      for (let round = 1; round <= item.repeat; round++) {
        for (const step of item.steps) {
          out.push({ ...step, index: out.length, round, rounds: item.repeat });
        }
      }
    } else {
      out.push({ ...item, index: out.length });
    }
  }
  return out;
}

/** Total planned time in seconds, counting only time-based steps. */
export function plannedDurationSec(workout: Workout): number {
  return flatten(workout).reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
}

export function stepName(step: Step): string {
  if (step.label) return step.label;
  switch (step.kind) {
    case 'warmup':
      return 'Warm up';
    case 'cooldown':
      return 'Cool down';
    default:
      return step.kind[0]!.toUpperCase() + step.kind.slice(1);
  }
}

/** Walk 1 min / run 1 min × 10, with a 5 min warmup and cooldown walk. */
export const walkRun1to1: Workout = {
  id: 'walk-run-1-1',
  name: 'Walk/run 1:1',
  items: [
    { kind: 'warmup', label: 'Warm up walk', durationSec: 300 },
    {
      repeat: 10,
      steps: [
        { kind: 'walk', durationSec: 60 },
        { kind: 'run', durationSec: 60 },
      ],
    },
    { kind: 'cooldown', durationSec: 300 },
  ],
};
