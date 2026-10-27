import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { deliverLocations } from './locationSink';
import { LOCATION_TASK } from './locationTask';
import { getSettings } from './settings';

export type TrackingResult = { ok: true } | { ok: false; reason: string; openSettings?: boolean };

/** Starts real background GPS, or simulated GPS when that setting is on (always on web). */
export async function startTracking(stepKind: () => string | undefined): Promise<TrackingResult> {
  if (Platform.OS === 'web' || getSettings().simulateGps) {
    fake.start(stepKind);
    return { ok: true };
  }
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) {
    return { ok: false, reason: 'Run Coach needs your location to record the run.', openSettings: !fg.canAskAgain };
  }
  // "Always" keeps recording with the screen locked. Without it we still record while the app is open.
  const bg = await Location.requestBackgroundPermissionsAsync();
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return { ok: true };
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    activityType: Location.ActivityType.Fitness,
    distanceInterval: 0,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
  });
  if (!bg.granted) {
    return {
      ok: false,
      reason: 'Recording only while the app is open. Allow location "Always" to keep recording with the screen locked.',
      openSettings: true,
    };
  }
  return { ok: true };
}

export async function stopTracking(): Promise<void> {
  fake.stop();
  if (Platform.OS === 'web') return;
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  }
}

export function openAppSettings(): void {
  void Linking.openURL('app-settings:');
}

// ---- Simulated GPS: walks and runs north from Tel Aviv's promenade, with gentle hills.

const DEG_PER_M = 1 / 111_195;

export const fake = {
  walkKmh: 5.5,
  runKmh: 9,
  timer: undefined as ReturnType<typeof setInterval> | undefined,
  lat: 32.08,
  lon: 34.77,
  distance: 0,
  start(stepKind: () => string | undefined) {
    this.stop();
    this.timer = setInterval(() => {
      const kind = stepKind();
      const kmh = kind === 'run' || kind === 'fast' || kind === undefined ? this.runKmh : this.walkKmh;
      const m = Math.max(0, (kmh / 3.6) * (1 + (Math.random() - 0.5) * 0.1));
      this.distance += m;
      // Gently winding heading; each step covers exactly `m` metres.
      const heading = 0.6 * Math.sin(this.distance / 700);
      this.lat += m * DEG_PER_M * Math.cos(heading);
      this.lon += (m * DEG_PER_M * Math.sin(heading)) / Math.cos((this.lat * Math.PI) / 180);
      deliverLocations([
        {
          t: Date.now(),
          lat: this.lat,
          lon: this.lon,
          altM: 20 + 8 * Math.sin((this.distance / 1600) * 2 * Math.PI),
          accuracyM: 5,
        },
      ]);
    }, 1000);
  },
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  },
  /** For testing the coach: slow down or speed up the run steps. */
  nudge(factor: number) {
    this.runKmh = Math.round(this.runKmh * factor * 2) / 2;
    return this.runKmh;
  },
};
