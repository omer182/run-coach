import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { deliverLocations } from './locationSink';

export const LOCATION_TASK = 'run-coach-location';

// Must be defined at module scope: iOS can wake the app for this task with no screen mounted.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  deliverLocations(
    data.locations.map(l => ({
      t: l.timestamp,
      lat: l.coords.latitude,
      lon: l.coords.longitude,
      altM: l.coords.altitude ?? undefined,
      accuracyM: l.coords.accuracy ?? undefined,
    })),
  );
});
