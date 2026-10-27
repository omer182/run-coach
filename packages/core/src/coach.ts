import type { EngineEvent, PaceStatus, RunState, Trend, TrendKind } from './engine';
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
  | 'trend'
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
  terrain?: 'uphill' | 'downhill' | 'flat';
  /** Pace of each finished round's walk and run, oldest first (last 6). */
  rounds?: { round: number; walk?: string; run?: string }[];
  /** Set when the trigger is "trend", or the most recent trend otherwise. */
  trend?: { kind: TrendKind; round?: number; pace: string; baseline?: string; vsBaseline?: string };
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
    case 'trend':
      return 'trend';
    case 'workout_complete':
      return 'workout_complete';
    case 'countdown':
      return null;
  }
}

function roundSummary(state: RunState): CoachSnapshot['rounds'] {
  const byRound = new Map<number, { round: number; walk?: string; run?: string }>();
  for (const s of state.stepStats) {
    if (s.round == null || s.paceSecPerKm == null) continue;
    const entry = byRound.get(s.round) ?? { round: s.round };
    if (s.kind === 'run' || s.kind === 'fast') entry.run = formatPace(s.paceSecPerKm);
    else if (s.kind === 'walk' || s.kind === 'rest') entry.walk = formatPace(s.paceSecPerKm);
    byRound.set(s.round, entry);
  }
  const rounds = [...byRound.values()].slice(-6);
  return rounds.length > 0 ? rounds : undefined;
}

function describeTrend(trend: Trend): NonNullable<CoachSnapshot['trend']> {
  const pct = trend.delta != null ? Math.round(Math.abs(trend.delta) * 100) : undefined;
  return {
    kind: trend.kind,
    round: trend.step.round,
    pace: formatPace(trend.step.paceSecPerKm),
    baseline: trend.baselineSecPerKm != null ? formatPace(trend.baselineSecPerKm) : undefined,
    vsBaseline: pct != null && trend.delta != null ? `${pct}% ${trend.delta > 0 ? 'slower' : 'faster'}` : undefined,
  };
}

export interface SnapshotContext {
  recentLines?: string[];
  paceStatus?: PaceStatus;
  /** The trend that triggered this request; defaults to the run's latest trend if it is recent. */
  trend?: Trend;
}

/** Old news isn't worth mentioning: only trends from the last couple of steps. */
function recentTrend(state: RunState): Trend | undefined {
  const t = state.lastTrend;
  return t && state.stepIndex - t.step.index <= 2 ? t : undefined;
}

export function buildSnapshot(
  state: RunState,
  workout: Workout | null,
  trigger: CoachTrigger,
  { recentLines = [], paceStatus, trend = recentTrend(state) }: SnapshotContext = {},
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
    terrain:
      state.gradePct == null ? undefined : state.gradePct > 2 ? 'uphill' : state.gradePct < -2 ? 'downhill' : 'flat',
    rounds: roundSummary(state),
    trend: trend && describeTrend(trend),
    recentLines: recentLines.slice(-5),
  };
}
