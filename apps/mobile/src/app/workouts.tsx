import { flatten, type Workout } from '@run-coach/core';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StepStrip } from '../components/StepStrip';
import { Button, Card, Header, Screen, Section } from '../components/ui';
import { confirm } from '../confirm';
import { db } from '../services/db';
import { updateSettings, useSettings } from '../services/settings';
import { colors, space, type } from '../theme';
import { useWorkouts } from '../useWorkouts';
import { describeWorkout, workoutMinutes } from '../workouts';

export default function Workouts() {
  const router = useRouter();
  const { presets, custom, reload } = useWorkouts();
  const { selectedWorkoutId } = useSettings();

  const choose = (w: Workout) => {
    void updateSettings({ selectedWorkoutId: w.id });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const remove = async (w: Workout) => {
    if (!(await confirm(`Delete "${w.name}"?`, 'This removes the saved workout.', 'Delete'))) return;
    await db.deleteWorkout(w.id);
    if (selectedWorkoutId === w.id) await updateSettings({ selectedWorkoutId: presets[0]!.id });
    await reload();
  };

  const item = (w: Workout, mine: boolean) => {
    const selected = w.id === selectedWorkoutId;
    return (
      <Card key={w.id} onPress={() => choose(w)} style={[{ gap: space.sm }, selected && styles.selected]}>
        <View style={styles.row}>
          <Text style={[type.heading, { flex: 1 }]}>{w.name}</Text>
          <Text style={type.dim}>{workoutMinutes(w)} min</Text>
        </View>
        <Text style={type.dim}>{describeWorkout(w)}</Text>
        <StepStrip steps={flatten(w)} currentIndex={-1} currentProgress={0} />
        {mine && (
          <View style={styles.row}>
            <Pressable onPress={() => router.push({ pathname: '/builder', params: { id: w.id } })} hitSlop={8}>
              <Text style={styles.action}>Edit</Text>
            </Pressable>
            <Pressable onPress={() => void remove(w)} hitSlop={8}>
              <Text style={[styles.action, { color: colors.danger }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </Card>
    );
  };

  return (
    <Screen>
      <Header title="Workouts" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      <Button label="+ Build your own" kind="primary" color={colors.walk} onPress={() => router.push('/builder')} />
      {custom.length > 0 && <Section title="Yours">{custom.map(w => item(w, true))}</Section>}
      <Section title="Built in">{presets.map(w => item(w, false))}</Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  selected: { borderWidth: 2, borderColor: colors.run },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  action: { color: colors.walk, fontWeight: '600', fontSize: 15 },
});
