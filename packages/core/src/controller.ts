import { buildSnapshot, coachTriggerFor, type CoachLineResponse, type CoachSnapshot, type CoachTrigger } from './coach';
import { cueText } from './cues';
import { WorkoutEngine, type EngineEvent, type EngineOptions, type LocationSample, type PaceStatus, type RunState } from './engine';
import type { Workout } from './workout';

/** A recorded GPS point, tagged with the workout step it belongs to. */
export interface StoredPoint extends LocationSample {
  stepIndex: number;
}

export type ControlKind = 'pause' | 'resume' | 'skip';

export interface StoredControl {
  t: number;
  kind: ControlKind;
}

export interface RunRecord {
  id: string;
  startedAt: number;
  workout: Workout | null;
  options: EngineOptions;
}

/** Everything the controller needs from the outside world, so it runs the same on a phone and in tests. */
export interface RunPorts {
  now(): number;
  newId(): string;
  /** Instant cues: must work offline. */
  speakCue(text: string): void;
  /** AI coach lines; `audioUrl` is absolute when the server voiced it. */
  speakCoach(text: string, audioUrl?: string): void;
  /** Null when no coach server is configured. */
  coach: ((snapshot: CoachSnapshot) => Promise<CoachLineResponse>) | null;
  store: {
    createRun(run: RunRecord): Promise<void>;
    appendPoints(runId: string, points: StoredPoint[]): Promise<void>;
    appendControl(runId: string, control: StoredControl): Promise<void>;
    finishRun(runId: string, endedAt: number, state: RunState): Promise<void>;
  };
  log?(message: string): void;
}

export interface CoachLogEntry {
  at: number;
  elapsedSec: number;
  kind: 'cue' | 'coach' | 'trend' | 'error';
  text: string;
}

export interface ControllerSnapshot {
  runId: string | null;
  workout: Workout | null;
  state: RunState | null;
  log: CoachLogEntry[];
  coachBusy: boolean;
}

export interface ControllerOptions {
  /** Ask for a fresh line when the coach has been quiet this long. */
  periodicSec?: number;
  engine?: EngineOptions;
}

/**
 * One run, from start to finish: feeds GPS into the workout engine, speaks cues, asks the
 * AI coach for lines and saves everything as it happens so a crash loses nothing.
 */
export class RunController {
  private engine: WorkoutEngine | null = null;
  private workout: Workout | null = null;
  private runId: string | null = null;
  private log: CoachLogEntry[] = [];
  private recentLines: string[] = [];
  private lastCoachSec = -Infinity;
  private coachInFlight = false;
  private finalMinuteDone = false;
  private paceStatus: PaceStatus | undefined;
  private listeners = new Set<() => void>();
  private snapshotCache: ControllerSnapshot | null = null;
  private readonly periodicSec: number;
  private readonly engineOptions: EngineOptions;
  /** Points not yet written, flushed in batches to keep storage writes cheap. */
  private pending: StoredPoint[] = [];
  private writes: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly ports: RunPorts,
    options: ControllerOptions = {},
  ) {
    this.periodicSec = options.periodicSec ?? 60;
    this.engineOptions = options.engine ?? {};
  }

  // ---- Observing (shaped for React's useSyncExternalStore)

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ControllerSnapshot => {
    this.snapshotCache ??= {
      runId: this.runId,
      workout: this.workout,
      state: this.engine?.state() ?? null,
      log: this.log,
      coachBusy: this.coachInFlight,
    };
    return this.snapshotCache;
  };

  get active(): boolean {
    const status = this.engine?.state().status;
    return status === 'running' || status === 'paused';
  }

  // ---- Commands

  /** `engineOptions` overrides the defaults for this run, e.g. the runner's current usual pace. */
  async start(workout: Workout | null, engineOptions: EngineOptions = this.engineOptions): Promise<string> {
    if (this.active) throw new Error('A run is already in progress');
    const t = this.ports.now();
    this.reset();
    this.workout = workout;
    this.engine = new WorkoutEngine(workout, engineOptions);
    this.runId = this.ports.newId();
    const record: RunRecord = { id: this.runId, startedAt: t, workout, options: engineOptions };
    await this.ports.store.createRun(record);
    // The welcome line covers the first step, so its step_start doesn't also ask the coach.
    this.handle(this.engine.start(t), { coach: false });
    void this.askCoach('start');
    this.changed();
    return this.runId;
  }

  /** Feed location updates (the background task delivers them in batches). */
  onLocations(samples: LocationSample[]): void {
    if (!this.engine || !this.runId || this.engine.state().status !== 'running') return;
    for (const sample of samples) {
      const stepIndex = this.engine.state().stepIndex;
      this.handle(this.engine.update(sample));
      this.pending.push({ ...sample, stepIndex });
    }
    if (this.pending.length >= 10) this.flush();
    this.afterTick();
  }

  /** Advance the clock when no GPS arrived, e.g. a UI timer while the screen is on. */
  tick(): void {
    if (!this.engine || this.engine.state().status !== 'running') return;
    this.handle(this.engine.tick(this.ports.now()));
    this.afterTick();
  }

  pause(): void {
    if (!this.engine || this.engine.state().status !== 'running') return;
    const t = this.ports.now();
    this.handle(this.engine.pause(t));
    this.control({ t, kind: 'pause' });
    this.ports.speakCue('Paused.');
    this.changed();
  }

  resume(): void {
    if (!this.engine || this.engine.state().status !== 'paused') return;
    const t = this.ports.now();
    this.engine.resume(t);
    this.control({ t, kind: 'resume' });
    this.ports.speakCue('Resuming.');
    this.changed();
  }

  skip(): void {
    if (!this.engine || this.engine.state().status !== 'running') return;
    const t = this.ports.now();
    this.handle(this.engine.skipStep(t));
    this.control({ t, kind: 'skip' });
    this.changed();
  }

  async stop(): Promise<string | null> {
    if (!this.engine || !this.runId || !this.active) return null;
    const t = this.ports.now();
    this.handle(this.engine.stop(t));
    this.flush();
    const runId = this.runId;
    const state = this.engine.state();
    await this.writes;
    await this.ports.store.finishRun(runId, t, state);
    this.ports.speakCue(`Run saved. ${(state.distanceM / 1000).toFixed(2)} kilometers.`);
    this.changed();
    return runId;
  }

  /** Drop a stopped run from memory so the next one starts clean. */
  clear(): void {
    if (this.active) return;
    this.reset();
    this.changed();
  }

  /**
   * Rebuild a run that was interrupted (app killed, phone restarted) from what was saved,
   * then keep going. Events during replay are not spoken.
   */
  restore(run: RunRecord, points: StoredPoint[], controls: StoredControl[]): void {
    this.reset();
    this.workout = run.workout;
    this.runId = run.id;
    this.engine = replayRun(run, points, controls);
    if (this.engine.state().status === 'running') {
      // The time the app was dead isn't running time: come back paused at the last thing we saw.
      const lastT = Math.max(run.startedAt, ...points.map(p => p.t), ...controls.map(c => c.t));
      this.engine.pause(lastT);
      this.control({ t: lastT, kind: 'pause' });
    }
    this.changed();
  }

  /** Persist anything buffered; call when the app goes to the background. */
  flush(): void {
    if (!this.runId || this.pending.length === 0) return;
    const batch = this.pending;
    const runId = this.runId;
    this.pending = [];
    this.writes = this.writes
      .then(() => this.ports.store.appendPoints(runId, batch))
      .catch(err => this.ports.log?.(`saving points failed: ${(err as Error).message}`));
  }

  // ---- Internals

  private reset(): void {
    this.engine = null;
    this.workout = null;
    this.runId = null;
    this.log = [];
    this.recentLines = [];
    this.lastCoachSec = -Infinity;
    this.coachInFlight = false;
    this.finalMinuteDone = false;
    this.paceStatus = undefined;
    this.pending = [];
  }

  private control(control: StoredControl): void {
    if (!this.runId) return;
    this.flush();
    const runId = this.runId;
    this.writes = this.writes
      .then(() => this.ports.store.appendControl(runId, control))
      .catch(err => this.ports.log?.(`saving control failed: ${(err as Error).message}`));
  }

  private afterTick(): void {
    const s = this.engine!.state();
    if (!this.finalMinuteDone && !s.workoutDone && s.plannedSec > 0 && s.plannedSec - s.elapsedSec <= 60) {
      this.finalMinuteDone = true;
      void this.askCoach('final_minute');
    } else if (s.elapsedSec - this.lastCoachSec >= this.periodicSec) {
      void this.askCoach('periodic');
    }
    this.changed();
  }

  private handle(events: EngineEvent[], { coach = true } = {}): void {
    for (const event of events) {
      const cue = cueText(event);
      if (cue) {
        this.addLog('cue', cue);
        this.ports.speakCue(cue);
      }
      if (event.type === 'pace') this.paceStatus = event.status;
      if (event.type === 'step_start') this.paceStatus = undefined;
      if (event.type === 'trend') this.addLog('trend', event.kind.replace(/_/g, ' '));
      const trigger = coach ? coachTriggerFor(event) : null;
      if (trigger) void this.askCoach(trigger);
    }
  }

  private async askCoach(trigger: CoachTrigger): Promise<void> {
    const engine = this.engine;
    if (!this.ports.coach || !engine || this.coachInFlight) return;
    const runId = this.runId;
    this.coachInFlight = true;
    this.lastCoachSec = engine.state().elapsedSec;
    const snapshot = buildSnapshot(engine.state(), this.workout, trigger, {
      recentLines: this.recentLines,
      paceStatus: this.paceStatus,
    });
    this.changed();
    try {
      const res = await this.ports.coach(snapshot);
      // The run may have ended or been replaced while we waited.
      if (this.runId !== runId || !this.active) return;
      this.recentLines = [...this.recentLines, res.text].slice(-5);
      this.addLog('coach', res.text);
      this.ports.speakCoach(res.text, res.audioUrl);
    } catch (err) {
      // No signal or server down: the instant cues keep the run going.
      this.addLog('error', `Coach unavailable: ${(err as Error).message}`);
    } finally {
      this.coachInFlight = false;
      this.changed();
    }
  }

  private addLog(kind: CoachLogEntry['kind'], text: string): void {
    const elapsedSec = this.engine?.state().elapsedSec ?? 0;
    this.log = [{ at: this.ports.now(), elapsedSec, kind, text }, ...this.log].slice(0, 50);
  }

  private changed(): void {
    this.snapshotCache = null;
    for (const l of this.listeners) l();
  }
}

/** Rebuilds a run's engine from saved points and controls, e.g. for crash recovery or a summary. */
export function replayRun(run: RunRecord, points: StoredPoint[], controls: StoredControl[]): WorkoutEngine {
  const engine = new WorkoutEngine(run.workout, run.options);
  engine.start(run.startedAt);
  const timeline = [
    ...points.map(p => ({ t: p.t, point: p as StoredPoint | null, control: null as StoredControl | null })),
    ...controls.map(c => ({ t: c.t, point: null, control: c })),
  ].sort((a, b) => a.t - b.t);
  for (const item of timeline) {
    if (item.point) engine.update(item.point);
    else if (item.control?.kind === 'pause') engine.pause(item.t);
    else if (item.control?.kind === 'resume') engine.resume(item.t);
    else if (item.control?.kind === 'skip') engine.skipStep(item.t);
  }
  return engine;
}
