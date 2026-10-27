import type { StoredControl, StoredPoint, Workout } from '@run-coach/core';
import type { Db, RunRow } from './dbTypes';

// The browser build is for trying the UI; it keeps runs in localStorage instead of SQLite.

interface WebStore {
  runs: RunRow[];
  points: Record<string, StoredPoint[]>;
  controls: Record<string, StoredControl[]>;
  workouts: Workout[];
}

const KEY = 'runcoach-db';

function load(): WebStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as WebStore;
  } catch {}
  return { runs: [], points: {}, controls: {}, workouts: [] };
}

const store = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

export const db: Db = {
  async createRun(run) {
    store.runs.push({
      id: run.id,
      name: run.workout?.name ?? 'Free run',
      startedAt: run.startedAt,
      endedAt: null,
      workout: run.workout,
      options: run.options,
      distanceM: 0,
      elapsedSec: 0,
      climbM: 0,
    });
    save();
  },
  async appendPoints(runId, points) {
    (store.points[runId] ??= []).push(...points);
    save();
  },
  async appendControl(runId, control) {
    (store.controls[runId] ??= []).push(control);
    save();
  },
  async finishRun(runId, endedAt, state) {
    const run = store.runs.find(r => r.id === runId);
    if (run) Object.assign(run, { endedAt, distanceM: state.distanceM, elapsedSec: state.elapsedSec, climbM: state.climbM });
    save();
  },
  async listRuns(limit = 100) {
    return store.runs
      .filter(r => r.endedAt != null)
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  },
  async getRun(id) {
    return store.runs.find(r => r.id === id) ?? null;
  },
  async getActiveRun() {
    return [...store.runs].reverse().find(r => r.endedAt == null) ?? null;
  },
  async getPoints(runId) {
    return store.points[runId] ?? [];
  },
  async getControls(runId) {
    return store.controls[runId] ?? [];
  },
  async deleteRun(id) {
    store.runs = store.runs.filter(r => r.id !== id);
    delete store.points[id];
    delete store.controls[id];
    save();
  },
  async saveWorkout(w) {
    store.workouts = [w, ...store.workouts.filter(x => x.id !== w.id)];
    save();
  },
  async listWorkouts() {
    return store.workouts;
  },
  async deleteWorkout(id) {
    store.workouts = store.workouts.filter(w => w.id !== id);
    save();
  },
};
