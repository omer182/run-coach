import type { LocationSample } from '@run-coach/core';

// The background task and the fake GPS both deliver here; the runtime decides where it goes.
// Kept separate so the task file has no import cycle with the runtime.

let sink: ((samples: LocationSample[]) => void) | null = null;

export function setLocationSink(fn: (samples: LocationSample[]) => void): void {
  sink = fn;
}

export function deliverLocations(samples: LocationSample[]): void {
  sink?.(samples);
}
