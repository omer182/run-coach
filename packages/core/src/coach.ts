import type { EngineEvent, PaceStatus, RunState } from './engine';
import { formatClock, formatPace } from './geo';
import { stepName, type Workout } from './workout';

export type CoachPersonality = 'friendly' | 'tough' | 'calm';

export interface CoachProfile {
  name?: string;
  /** The runner's own reasons, in their words. */
  why: string[];
  goal?: string;
  personality: CoachPersonality;
}

export type CoachTrigger =
  | 'start'
  | 'periodic'
  | 'step_start'
  | 'km_split'
  | 'halfway'
  | 'pace'
  | 'final_minute'
  | 'workout_complete';

/** What the phone sends the server when it wants a coach line. Small and readable on purpose. */
export interface CoachSnapshot {
  trigger: CoachTrigger;
  workoutName?: string;
  elapsed: string;
  plannedTotal?: string;
  progressPct?: number;
  distanceKm: number;
  pace: string;
  avgPace: string;
  paceStatus?: PaceStatus;
  targetPace?: string;
  step?: { name: string; kind: string; round?: number; rounds?: number; remaining?: string };
  next?: string;
  lastSplit?: string;
  climbM: number;
  recentLines: string[];
}

export interface CoachLineResponse {
  text: string;
  /** Relative URL of the spoken line, when TTS is available. */
  audioUrl?: string;
}

/** Which engine events deserve an AI line on top of the instant cue. */
export function coachTriggerFor(event: EngineEvent): CoachTrigger | null {
  switch (event.type) {
    case 'step_start':
      return 'step_start';
    case 'km_split':
      return 'km_split';
    case 'halfway':
      return 'halfway';
    case 'pace':
      return 'pace';
    case 'workout_complete':
      return 'workout_complete';
    case 'countdown':
      return null;
  }
}

export function buildSnapshot(
  state: RunState,
  workout: Workout | null,
  trigger: CoachTrigger,
  recentLines: string[] = [],
  paceStatus?: PaceStatus,
): CoachSnapshot {
  const step = state.step;
  const lastSplit = state.splitsSec[state.splitsSec.length - 1];
  return {
    trigger,
    workoutName: workout?.name,
    elapsed: formatClock(state.elapsedSec),
    plannedTotal: state.plannedSec > 0 ? formatClock(state.plannedSec) : undefined,
    progressPct: state.plannedSec > 0 ? Math.min(100, Math.round((state.elapsedSec / state.plannedSec) * 100)) : undefined,
    distanceKm: Math.round(state.distanceM / 10) / 100,
    pace: formatPace(state.paceSecPerKm),
    avgPace: formatPace(state.avgPaceSecPerKm),
    paceStatus,
    targetPace: step?.pace ? `${formatPace(step.pace.minSecPerKm)}-${formatPace(step.pace.maxSecPerKm)}` : undefined,
    step: step && {
      name: stepName(step),
      kind: step.kind,
      round: step.round,
      rounds: step.rounds,
      remaining:
        state.stepRemainingSec != null
          ? formatClock(state.stepRemainingSec)
          : state.stepRemainingM != null
            ? `${Math.round(state.stepRemainingM)} m`
            : undefined,
    },
    next: state.next && stepName(state.next),
    lastSplit: lastSplit != null ? formatClock(lastSplit) : undefined,
    climbM: Math.round(state.climbM),
    recentLines: recentLines.slice(-5),
  };
}
