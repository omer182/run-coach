import type { RunState, StoredControl, StoredPoint, Workout } from '@run-coach/core';
import * as SQLite from 'expo-sqlite';
import type { Db, RunRow } from './dbTypes';

interface RunDbRow {
  id: string;
  name: string;
  started_at: number;
  ended_at: number | null;
  workout_json: string | null;
  options_json: string;
  distance_m: number;
  elapsed_sec: number;
  climb_m: number;
}

const SCHEMA = `
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  workout_json TEXT,
  options_json TEXT NOT NULL,
  distance_m REAL NOT NULL DEFAULT 0,
  elapsed_sec REAL NOT NULL DEFAULT 0,
  climb_m REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS points (
  run_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  alt REAL,
  acc REAL,
  step_index INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS points_run ON points (run_id, t);
CREATE TABLE IF NOT EXISTS controls (
  run_id TEXT NOT NULL,
  t INTEGER NOT NULL,
  kind TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS workouts (
  id TEXT PRIMARY KEY NOT NULL,
  json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

function toRow(r: RunDbRow): RunRow {
  return {
    id: r.id,
    name: r.name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    workout: r.workout_json ? (JSON.parse(r.workout_json) as Workout) : null,
    options: JSON.parse(r.options_json),
    distanceM: r.distance_m,
    elapsedSec: r.elapsed_sec,
    climbM: r.climb_m,
  };
}

let opened: Promise<SQLite.SQLiteDatabase> | null = null;

function database(): Promise<SQLite.SQLiteDatabase> {
  opened ??= SQLite.openDatabaseAsync('runcoach.db').then(async db => {
    await db.execAsync(SCHEMA);
    return db;
  });
  return opened;
}

export const db: Db = {
  async createRun(run) {
    const d = await database();
    await d.runAsync(
      'INSERT INTO runs (id, name, started_at, workout_json, options_json) VALUES (?, ?, ?, ?, ?)',
      run.id,
      run.workout?.name ?? 'Free run',
      run.startedAt,
      run.workout ? JSON.stringify(run.workout) : null,
      JSON.stringify(run.options),
    );
  },

  async appendPoints(runId: string, points: StoredPoint[]) {
    const d = await database();
    await d.withExclusiveTransactionAsync(async tx => {
      for (const p of points) {
        await tx.runAsync(
          'INSERT INTO points (run_id, t, lat, lon, alt, acc, step_index) VALUES (?, ?, ?, ?, ?, ?, ?)',
          runId,
          p.t,
          p.lat,
          p.lon,
          p.altM ?? null,
          p.accuracyM ?? null,
          p.stepIndex,
        );
      }
    });
  },

  async appendControl(runId: string, control: StoredControl) {
    const d = await database();
    await d.runAsync('INSERT INTO controls (run_id, t, kind) VALUES (?, ?, ?)', runId, control.t, control.kind);
  },

  async finishRun(runId: string, endedAt: number, state: RunState) {
    const d = await database();
    await d.runAsync(
      'UPDATE runs SET ended_at = ?, distance_m = ?, elapsed_sec = ?, climb_m = ? WHERE id = ?',
      endedAt,
      state.distanceM,
      state.elapsedSec,
      state.climbM,
      runId,
    );
  },

  async listRuns(limit = 100) {
    const d = await database();
    const rows = await d.getAllAsync<RunDbRow>(
      'SELECT * FROM runs WHERE ended_at IS NOT NULL ORDER BY started_at DESC LIMIT ?',
      limit,
    );
    return rows.map(toRow);
  },

  async getRun(id) {
    const d = await database();
    const row = await d.getFirstAsync<RunDbRow>('SELECT * FROM runs WHERE id = ?', id);
    return row ? toRow(row) : null;
  },

  async getActiveRun() {
    const d = await database();
    const row = await d.getFirstAsync<RunDbRow>(
      'SELECT * FROM runs WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
    );
    return row ? toRow(row) : null;
  },

  async getPoints(runId) {
    const d = await database();
    const rows = await d.getAllAsync<{ t: number; lat: number; lon: number; alt: number | null; acc: number | null; step_index: number }>(
      'SELECT t, lat, lon, alt, acc, step_index FROM points WHERE run_id = ? ORDER BY t',
      runId,
    );
    return rows.map(r => ({
      t: r.t,
      lat: r.lat,
      lon: r.lon,
      altM: r.alt ?? undefined,
      accuracyM: r.acc ?? undefined,
      stepIndex: r.step_index,
    }));
  },

  async getControls(runId) {
    const d = await database();
    return d.getAllAsync<StoredControl>('SELECT t, kind FROM controls WHERE run_id = ? ORDER BY t', runId);
  },

  async deleteRun(id) {
    const d = await database();
    await d.withExclusiveTransactionAsync(async tx => {
      await tx.runAsync('DELETE FROM points WHERE run_id = ?', id);
      await tx.runAsync('DELETE FROM controls WHERE run_id = ?', id);
      await tx.runAsync('DELETE FROM runs WHERE id = ?', id);
    });
  },

  async saveWorkout(w) {
    const d = await database();
    await d.runAsync(
      'INSERT OR REPLACE INTO workouts (id, json, updated_at) VALUES (?, ?, ?)',
      w.id,
      JSON.stringify(w),
      Date.now(),
    );
  },

  async listWorkouts() {
    const d = await database();
    const rows = await d.getAllAsync<{ json: string }>('SELECT json FROM workouts ORDER BY updated_at DESC');
    return rows.map(r => JSON.parse(r.json) as Workout);
  },

  async deleteWorkout(id) {
    const d = await database();
    await d.runAsync('DELETE FROM workouts WHERE id = ?', id);
  },
};
