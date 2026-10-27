import { RunController, type Workout } from '@run-coach/core';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { coachConfigured, requestCoachLine } from './coachClient';
import { db } from './db';
import { runRecord } from './dbTypes';
import { setLocationSink } from './locationSink';
import { getSettings, loadSettings, parsePace } from './settings';
import { startTracking, stopTracking, type TrackingResult } from './tracking';
import { prepareAudio, speakCoach, speakCue, stopSpeaking } from './voice';

/** The one run controller for the app, shared by the background GPS task and the screens. */
export const controller = new RunController(
  {
    now: () => Date.now(),
    newId: () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    speakCue,
    speakCoach,
    get coach() {
      return coachConfigured() ? requestCoachLine : null;
    },
    store: db,
    log: message => console.warn(message),
  },
  { periodicSec: 60 },
);

setLocationSink(samples => controller.onLocations(samples));

// Save buffered points whenever the app leaves the foreground.
AppState.addEventListener('change', state => {
  if (state !== 'active') controller.flush();
});

const stepKind = () => controller.getSnapshot().state?.step?.kind;

export function useRun() {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

let booted: Promise<string | null> | null = null;

/** Loads settings and picks up a run the app was killed in the middle of. Returns its id. */
export function boot(): Promise<string | null> {
  booted ??= (async () => {
    await loadSettings();
    const active = await db.getActiveRun();
    if (!active || controller.active) return null;
    const [points, controls] = await Promise.all([db.getPoints(active.id), db.getControls(active.id)]);
    controller.restore(runRecord(active), points, controls);
    return active.id;
  })();
  return booted;
}

export async function startRun(workout: Workout | null): Promise<TrackingResult> {
  await prepareAudio();
  const usual = parsePace(getSettings().usualPace);
  await controller.start(workout, usual ? { usualRunPaceSecPerKm: usual } : {});
  const tracking = await startTracking(stepKind);
  if (!tracking.ok && tracking.reason.startsWith('Run Coach needs')) {
    // No location at all: there is no run to record.
    await controller.stop();
    const id = controller.getSnapshot().runId;
    controller.clear();
    if (id) await db.deleteRun(id);
    stopSpeaking();
  }
  return tracking;
}

export function pauseRun(): void {
  controller.pause();
}

export async function resumeRun(): Promise<TrackingResult> {
  // After a crash restore, GPS isn't running yet.
  const tracking = await startTracking(stepKind);
  controller.resume();
  return tracking;
}

export function skipStep(): void {
  controller.skip();
}

/** Ends the run, saves it, and returns its id for the summary. */
export async function finishRun(): Promise<string | null> {
  const id = await controller.stop();
  await stopTracking();
  controller.clear();
  return id;
}

/** Throws away the current run entirely. */
export async function discardRun(): Promise<void> {
  const id = controller.getSnapshot().runId;
  await controller.stop();
  await stopTracking();
  controller.clear();
  stopSpeaking();
  if (id) await db.deleteRun(id);
}
