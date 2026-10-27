import type { Workout } from '@run-coach/core';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { db } from './services/db';
import { useSettings } from './services/settings';
import { PRESETS } from './workouts';

/** Built-in plus saved workouts, refreshed whenever the screen comes back into view. */
export function useWorkouts() {
  const [custom, setCustom] = useState<Workout[]>([]);
  const settings = useSettings();
  useFocusEffect(
    useCallback(() => {
      void db.listWorkouts().then(setCustom);
    }, []),
  );
  const all = [...custom, ...PRESETS];
  const selected = all.find(w => w.id === settings.selectedWorkoutId) ?? PRESETS[0]!;
  return { presets: PRESETS, custom, all, selected, reload: () => db.listWorkouts().then(setCustom) };
}

export function findWorkout(id: string, custom: Workout[]): Workout | null {
  return [...custom, ...PRESETS].find(w => w.id === id) ?? null;
}
