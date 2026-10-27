import { haversineM } from './geo';
import { flatten, plannedDurationSec, type FlatStep, type PaceTarget, type StepKind, type Workout } from './workout';

export interface LocationSample {
  /** Epoch milliseconds. */
  t: number;
  lat: number;
  lon: number;
  altM?: number;
  accuracyM?: number;
}

export type PaceStatus = 'slow' | 'fast' | 'on_target';

/** How one finished step went. */
export interface StepStat {
  index: number;
  kind: StepKind;
  round?: number;
  durationSec: number;
  distanceM: number;
  paceSecPerKm: number | null;
  climbM: number;
}

/**
 * How the runner is doing compared to themselves:
 * - fading: run steps getting clearly slower than this run's first rounds
 * - back_on_pace: recovered after fading
 * - too_fast: early run steps much faster than their usual pace
 * - not_recovering: walk steps so fast they aren't recovery
 * - uphill: a slow run step that was mostly climbing, which is fine
 */
export type TrendKind = 'fading' | 'back_on_pace' | 'too_fast' | 'not_recovering' | 'uphill';

export interface Trend {
  kind: TrendKind;
  step: StepStat;
  baselineSecPerKm?: number;
  /** Positive = slower than baseline, as a fraction (0.12 = 12% slower). */
  delta?: number;
}

export type EngineEvent =
  | { type: 'step_start'; step: FlatStep; next?: FlatStep }
  | { type: 'countdown'; secondsLeft: number; next?: FlatStep }
  | { type: 'km_split'; km: number; splitSec: number }
  | { type: 'halfway' }
  | { type: 'pace'; status: PaceStatus; paceSecPerKm: number; target: PaceTarget }
  | ({ type: 'trend' } & Trend)
  | { type: 'workout_complete' };

export interface RunState {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  elapsedSec: number;
  distanceM: number;
  /** Rolling pace over the last ~30 s, null when not moving. */
  paceSecPerKm: number | null;
  avgPaceSecPerKm: number | null;
  climbM: number;
  descentM: number;
  splitsSec: number[];
  workoutDone: boolean;
  step?: FlatStep;
  next?: FlatStep;
  stepIndex: number;
  totalSteps: number;
  stepElapsedSec: number;
  stepRemainingSec?: number;
  stepRemainingM?: number;
  plannedSec: number;
  stepStats: StepStat[];
  /** Grade over the last ~30 s in percent; positive is uphill. */
  gradePct: number | null;
  lastTrend?: Trend;
}

export interface EngineOptions {
  /** The runner's normal run pace from past runs; enables "too fast" warnings. */
  usualRunPaceSecPerKm?: number;
  /** Samples less accurate than this are ignored. */
  maxAccuracyM?: number;
  /** Faster than this between two samples is a GPS jump, not running. */
  maxSpeedMps?: number;
  paceWindowSec?: number;
  /** Altitude must move this far before it counts as climb or descent. */
  elevationThresholdM?: number;
  /** Minimum gap between repeated "still off pace" events. */
  paceRepeatSec?: number;
  /** A run step this much slower than the run's baseline counts as fading. */
  fadeFraction?: number;
  /** An early run step this much faster than the usual pace counts as too fast. */
  tooFastFraction?: number;
  /** Walk steps faster than this (sec/km) aren't recovery. 510 = 7 km/h. */
  recoveryPaceSecPerKm?: number;
  /** Climb per distance above which a run step counts as uphill. */
  hillGrade?: number;
  /** Steps between repeats of the same trend, so the coach doesn't nag. */
  trendRepeatSteps?: number;
}

type ResolvedOptions = Required<Omit<EngineOptions, 'usualRunPaceSecPerKm'>> &
  Pick<EngineOptions, 'usualRunPaceSecPerKm'>;

const DEFAULTS: ResolvedOptions = {
  maxAccuracyM: 30,
  maxSpeedMps: 12,
  paceWindowSec: 30,
  elevationThresholdM: 2,
  paceRepeatSec: 45,
  fadeFraction: 0.08,
  tooFastFraction: 0.1,
  recoveryPaceSecPerKm: 510,
  hillGrade: 0.03,
  trendRepeatSteps: 4,
};

const isRunKind = (kind: StepKind) => kind === 'run' || kind === 'fast';

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Runs a workout against location samples. It advances on whatever clock the caller
 * passes in, never on its own timers, because iOS suspends JS timers while the screen
 * is locked but keeps delivering location updates.
 */
export class WorkoutEngine {
  private readonly opts: ResolvedOptions;
  private readonly steps: FlatStep[];
  private readonly plannedSec: number;

  private status: RunState['status'] = 'idle';
  private activeMs = 0;
  private lastTickT = 0;
  private distanceM = 0;
  private climbM = 0;
  private descentM = 0;
  private lastPoint: LocationSample | null = null;
  private altAnchor: number | null = null;
  private window: { sec: number; m: number; alt?: number }[] = [];
  private splitsSec: number[] = [];
  private lastSplitSec = 0;

  private stepIndex = -1;
  private stepStartSec = 0;
  private stepStartM = 0;
  private lastCountdown = Infinity;
  private paceStatus: PaceStatus | null = null;
  private lastPaceEventSec = -Infinity;
  private halfwayDone = false;
  private workoutDone = false;
  private stepStartClimb = 0;
  private stepStats: StepStat[] = [];
  private lastTrend: Trend | undefined;

  constructor(workout: Workout | null, options: EngineOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this.steps = workout ? flatten(workout) : [];
    this.plannedSec = workout ? plannedDurationSec(workout) : 0;
  }

  start(t: number): EngineEvent[] {
    if (this.status !== 'idle') return [];
    this.status = 'running';
    this.lastTickT = t;
    const events: EngineEvent[] = [];
    if (this.steps.length > 0) this.enterStep(0, events);
    else this.workoutDone = true;
    return events;
  }

  pause(t: number): EngineEvent[] {
    if (this.status !== 'running') return [];
    const events = this.tick(t);
    this.status = 'paused';
    return events;
  }

  resume(t: number): void {
    if (this.status !== 'paused') return;
    this.status = 'running';
    this.lastTickT = t;
    // Don't count distance covered while paused.
    this.lastPoint = null;
    this.window = [];
  }

  stop(t: number): EngineEvent[] {
    const events = this.status === 'running' ? this.tick(t) : [];
    this.status = 'stopped';
    return events;
  }

  skipStep(t: number): EngineEvent[] {
    const events = this.tick(t);
    if (this.status === 'running' && !this.workoutDone) {
      this.stepStartSec = this.elapsedSec();
      this.stepStartM = this.distanceM;
      this.stepStartClimb = this.climbM;
      this.advance(events);
    }
    return events;
  }

  /** Feed a location update. Also advances the clock to `sample.t`. */
  update(sample: LocationSample): EngineEvent[] {
    if (this.status !== 'running') return [];
    this.advanceClock(sample.t);
    if (sample.accuracyM != null && sample.accuracyM > this.opts.maxAccuracyM) return this.evaluate();

    const prev = this.lastPoint;
    this.lastPoint = sample;
    if (prev) {
      const d = haversineM(prev.lat, prev.lon, sample.lat, sample.lon);
      const dt = (sample.t - prev.t) / 1000;
      if (dt > 0 && d / dt <= this.opts.maxSpeedMps) {
        this.distanceM += d;
        this.window.push({ sec: this.elapsedSec(), m: this.distanceM, alt: sample.altM });
      }
    } else {
      this.window.push({ sec: this.elapsedSec(), m: this.distanceM, alt: sample.altM });
    }
    this.trackElevation(sample.altM);
    return this.evaluate();
  }

  /** Advance the clock without a location, e.g. from a UI timer while the app is open. */
  tick(t: number): EngineEvent[] {
    if (this.status !== 'running') return [];
    this.advanceClock(t);
    return this.evaluate();
  }

  private advanceClock(t: number): void {
    if (t > this.lastTickT) {
      this.activeMs += t - this.lastTickT;
      this.lastTickT = t;
    }
  }

  state(): RunState {
    const elapsed = this.elapsedSec();
    const step = this.steps[this.stepIndex];
    const stepElapsed = elapsed - this.stepStartSec;
    return {
      status: this.status,
      elapsedSec: elapsed,
      distanceM: this.distanceM,
      paceSecPerKm: this.rollingPace(),
      avgPaceSecPerKm: this.distanceM > 50 ? (elapsed / this.distanceM) * 1000 : null,
      climbM: this.climbM,
      descentM: this.descentM,
      splitsSec: [...this.splitsSec],
      workoutDone: this.workoutDone,
      step: this.workoutDone ? undefined : step,
      next: this.workoutDone ? undefined : this.steps[this.stepIndex + 1],
      stepIndex: this.stepIndex,
      totalSteps: this.steps.length,
      stepElapsedSec: this.workoutDone ? 0 : stepElapsed,
      stepRemainingSec:
        !this.workoutDone && step?.durationSec != null ? Math.max(0, step.durationSec - stepElapsed) : undefined,
      stepRemainingM:
        !this.workoutDone && step?.distanceM != null
          ? Math.max(0, step.distanceM - (this.distanceM - this.stepStartM))
          : undefined,
      plannedSec: this.plannedSec,
      stepStats: [...this.stepStats],
      gradePct: this.rollingGradePct(),
      lastTrend: this.lastTrend,
    };
  }

  private elapsedSec(): number {
    return this.activeMs / 1000;
  }

  private evaluate(): EngineEvent[] {
    const events: EngineEvent[] = [];
    const elapsed = this.elapsedSec();

    while (this.distanceM >= (this.splitsSec.length + 1) * 1000) {
      const km = this.splitsSec.length + 1;
      // Split time interpolated to the moment the km mark was crossed is overkill here;
      // samples arrive about once a second.
      const splitSec = elapsed - this.lastSplitSec;
      this.splitsSec.push(splitSec);
      this.lastSplitSec = elapsed;
      events.push({ type: 'km_split', km, splitSec });
    }

    if (!this.halfwayDone && this.plannedSec > 0 && elapsed >= this.plannedSec / 2) {
      this.halfwayDone = true;
      events.push({ type: 'halfway' });
    }

    if (this.workoutDone) return events;

    // A long gap between ticks can finish several short steps at once.
    for (;;) {
      const step = this.steps[this.stepIndex];
      if (!step) break;
      const stepElapsed = this.elapsedSec() - this.stepStartSec;
      const stepM = this.distanceM - this.stepStartM;
      if (step.durationSec != null && stepElapsed >= step.durationSec) {
        this.finishStep(step, step.durationSec, stepM, events);
        // Keep boundaries exact so rounding never drifts across many intervals.
        this.stepStartSec += step.durationSec;
        this.stepStartM = this.distanceM;
      } else if (step.distanceM != null && stepM >= step.distanceM) {
        this.finishStep(step, stepElapsed, step.distanceM, events);
        this.stepStartSec = this.elapsedSec();
        this.stepStartM += step.distanceM;
      } else {
        break;
      }
      this.advance(events);
      if (this.workoutDone) return events;
    }

    this.countdown(events);
    this.checkPace(events);
    return events;
  }

  private advance(events: EngineEvent[]): void {
    const nextIndex = this.stepIndex + 1;
    if (nextIndex >= this.steps.length) {
      this.workoutDone = true;
      events.push({ type: 'workout_complete' });
      return;
    }
    this.enterStep(nextIndex, events);
  }

  private enterStep(index: number, events: EngineEvent[]): void {
    this.stepIndex = index;
    if (index === 0) {
      this.stepStartSec = this.elapsedSec();
      this.stepStartM = this.distanceM;
      this.stepStartClimb = this.climbM;
    }
    this.lastCountdown = Infinity;
    this.paceStatus = null;
    this.lastPaceEventSec = -Infinity;
    const step = this.steps[index]!;
    events.push({ type: 'step_start', step, next: this.steps[index + 1] });
  }

  private finishStep(step: FlatStep, durationSec: number, distanceM: number, events: EngineEvent[]): void {
    const stat: StepStat = {
      index: step.index,
      kind: step.kind,
      round: step.round,
      durationSec,
      distanceM,
      paceSecPerKm: distanceM >= 20 ? (durationSec / distanceM) * 1000 : null,
      climbM: this.climbM - this.stepStartClimb,
    };
    this.stepStartClimb = this.climbM;
    const trend = this.assess(stat);
    this.stepStats.push(stat);
    if (!trend) return;
    const last = this.lastTrend;
    const repeat = last?.kind === trend.kind && stat.index - last.step.index < this.opts.trendRepeatSteps;
    if (repeat) return;
    this.lastTrend = trend;
    events.push({ type: 'trend', ...trend });
  }

  /** Compares a finished step with the runner's own earlier steps (and usual pace, when known). */
  private assess(stat: StepStat): Trend | null {
    const pace = stat.paceSecPerKm;
    if (pace == null || stat.distanceM < 50) return null;

    if (stat.kind === 'walk' || stat.kind === 'rest') {
      return pace < this.opts.recoveryPaceSecPerKm ? { kind: 'not_recovering', step: stat } : null;
    }
    if (!isRunKind(stat.kind)) return null;

    const priorRuns = this.stepStats.filter(s => isRunKind(s.kind) && s.paceSecPerKm != null);
    const uphill = stat.climbM / stat.distanceM >= this.opts.hillGrade;
    const usual = this.opts.usualRunPaceSecPerKm;

    if (usual && priorRuns.length < 2 && pace < usual * (1 - this.opts.tooFastFraction)) {
      return { kind: 'too_fast', step: stat, baselineSecPerKm: usual, delta: (pace - usual) / usual };
    }
    if (priorRuns.length < 2) return null;

    // Baseline = how this runner ran the first rounds of today's run.
    const baseline = median(priorRuns.slice(0, 3).map(s => s.paceSecPerKm!));
    const delta = (pace - baseline) / baseline;
    if (delta >= this.opts.fadeFraction) {
      // Slower on a climb is expected, not fading.
      return { kind: uphill ? 'uphill' : 'fading', step: stat, baselineSecPerKm: baseline, delta };
    }
    if (this.lastTrend?.kind === 'fading' && delta < this.opts.fadeFraction / 2) {
      return { kind: 'back_on_pace', step: stat, baselineSecPerKm: baseline, delta };
    }
    return null;
  }

  private countdown(events: EngineEvent[]): void {
    const step = this.steps[this.stepIndex];
    if (!step?.durationSec || step.durationSec < 10) return;
    const remaining = step.durationSec - (this.elapsedSec() - this.stepStartSec);
    const secondsLeft = Math.ceil(remaining);
    if (secondsLeft >= 1 && secondsLeft <= 3 && secondsLeft < this.lastCountdown) {
      this.lastCountdown = secondsLeft;
      events.push({ type: 'countdown', secondsLeft, next: this.steps[this.stepIndex + 1] });
    }
  }

  private checkPace(events: EngineEvent[]): void {
    const step = this.steps[this.stepIndex];
    const target = step?.pace;
    if (!target) return;
    const elapsed = this.elapsedSec();
    // Give the runner time to settle into the step first.
    if (elapsed - this.stepStartSec < 20) return;
    const pace = this.rollingPace();
    if (pace == null) return;
    const status: PaceStatus =
      pace > target.maxSecPerKm ? 'slow' : pace < target.minSecPerKm ? 'fast' : 'on_target';
    const changed = status !== this.paceStatus;
    const stillOff = status !== 'on_target' && elapsed - this.lastPaceEventSec >= this.opts.paceRepeatSec;
    // "On target" is only worth saying when it is news, i.e. after being off.
    const worthSaying = status !== 'on_target' || (this.paceStatus != null && this.paceStatus !== 'on_target');
    if ((changed && worthSaying) || stillOff) {
      events.push({ type: 'pace', status, paceSecPerKm: pace, target });
      this.lastPaceEventSec = elapsed;
    }
    this.paceStatus = status;
  }

  private trimWindow(): void {
    const cutoff = this.elapsedSec() - this.opts.paceWindowSec;
    while (this.window.length > 1 && this.window[1]!.sec <= cutoff) this.window.shift();
  }

  private rollingGradePct(): number | null {
    this.trimWindow();
    const withAlt = this.window.filter(w => w.alt != null);
    const first = withAlt[0];
    const last = withAlt[withAlt.length - 1];
    if (!first || !last || last.m - first.m < 30) return null;
    return ((last.alt! - first.alt!) / (last.m - first.m)) * 100;
  }

  private rollingPace(): number | null {
    this.trimWindow();
    const first = this.window[0];
    const last = this.window[this.window.length - 1];
    if (!first || !last) return null;
    const dm = last.m - first.m;
    const ds = last.sec - first.sec;
    if (dm < 15 || ds <= 0) return null;
    return (ds / dm) * 1000;
  }

  private trackElevation(altM: number | undefined): void {
    if (altM == null) return;
    if (this.altAnchor == null) {
      this.altAnchor = altM;
      return;
    }
    const diff = altM - this.altAnchor;
    if (Math.abs(diff) >= this.opts.elevationThresholdM) {
      if (diff > 0) this.climbM += diff;
      else this.descentM -= diff;
      this.altAnchor = altM;
    }
  }
}
