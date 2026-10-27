import type { EngineOptions, RunRecord, RunState, StoredControl, StoredPoint, Workout } from '@run-coach/core';

export interface RunRow {
  id: string;
  name: string;
  startedAt: number;
  /** Null while the run is still going (or was interrupted). */
  endedAt: number | null;
  workout: Workout | null;
  options: EngineOptions;
  distanceM: number;
  elapsedSec: number;
  climbM: number;
}

export interface Db {
  createRun(run: RunRecord): Promise<void>;
  appendPoints(runId: string, points: StoredPoint[]): Promise<void>;
  appendControl(runId: string, control: StoredControl): Promise<void>;
  finishRun(runId: string, endedAt: number, state: RunState): Promise<void>;
  listRuns(limit?: number): Promise<RunRow[]>;
  getRun(id: string): Promise<RunRow | null>;
  /** The newest unfinished run, if the app died mid-run. */
  getActiveRun(): Promise<RunRow | null>;
  getPoints(runId: string): Promise<StoredPoint[]>;
  getControls(runId: string): Promise<StoredControl[]>;
  deleteRun(id: string): Promise<void>;
  saveWorkout(w: Workout): Promise<void>;
  listWorkouts(): Promise<Workout[]>;
  deleteWorkout(id: string): Promise<void>;
}

export function runRecord(row: RunRow): RunRecord {
  return { id: row.id, startedAt: row.startedAt, workout: row.workout, options: row.options };
}
