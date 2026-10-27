import { flatten, formatClock, isRepeat, plannedDurationSec } from '@run-coach/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { StepStrip } from '../components/StepStrip';
import { Button, Card, Header, Screen, Section, Stepper } from '../components/ui';
import { db } from '../services/db';
import { updateSettings } from '../services/settings';
import { colors, radius, space, type } from '../theme';
import { fromSimple, type SimpleIntervals } from '../workouts';

const mmss = (sec: number) => (sec < 60 ? `${sec} sec` : formatClock(sec));

const TEMPLATES: (SimpleIntervals & { label: string })[] = [
  { label: '1 / 1', name: 'Walk 1 / run 1', warmupMin: 5, walkSec: 60, runSec: 60, rounds: 10, cooldownMin: 5 },
  { label: '1 / 2', name: 'Walk 1 / run 2', warmupMin: 5, walkSec: 60, runSec: 120, rounds: 7, cooldownMin: 5 },
  { label: '1:30 / 3', name: 'Walk 1:30 / run 3', warmupMin: 5, walkSec: 90, runSec: 180, rounds: 5, cooldownMin: 5 },
  { label: '1 / 5', name: 'Walk 1 / run 5', warmupMin: 5, walkSec: 60, runSec: 300, rounds: 4, cooldownMin: 5 },
];

/** Template first, then tune with steppers: the shape most walk/run plans use. */
export default function Builder() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [s, setS] = useState<SimpleIntervals>(TEMPLATES[0]!);
  const [nameTouched, setNameTouched] = useState(false);

  // Editing an existing workout: load its numbers back into the steppers.
  useEffect(() => {
    if (!id) return;
    void db.listWorkouts().then(list => {
      const w = list.find(x => x.id === id);
      const block = w?.items.find(isRepeat);
      if (!w || !block) return;
      const single = w.items.filter(i => !isRepeat(i)) as { kind: string; durationSec?: number }[];
      setS({
        name: w.name,
        warmupMin: Math.round((single.find(i => i.kind === 'warmup')?.durationSec ?? 0) / 60),
        cooldownMin: Math.round((single.find(i => i.kind === 'cooldown')?.durationSec ?? 0) / 60),
        walkSec: block.steps.find(st => st.kind === 'walk')?.durationSec ?? 60,
        runSec: block.steps.find(st => st.kind === 'run')?.durationSec ?? 60,
        rounds: block.repeat,
      });
      setNameTouched(true);
    });
  }, [id]);

  const set = (patch: Partial<SimpleIntervals>) =>
    setS(prev => {
      const next = { ...prev, ...patch };
      // Keep the name describing the workout until the runner types their own.
      if (!nameTouched) next.name = `Walk ${mmss(next.walkSec)} / run ${mmss(next.runSec)}`;
      return next;
    });

  const workout = useMemo(() => fromSimple(s, id ?? `custom-${Date.now().toString(36)}`), [s, id]);
  const total = plannedDurationSec(workout);

  const save = async () => {
    await db.saveWorkout(workout);
    await updateSettings({ selectedWorkoutId: workout.id });
    router.dismissTo('/');
  };

  return (
    <Screen>
      <Header title={id ? 'Edit workout' : 'Build a workout'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />

      <Section title="Start from">
        <View style={styles.templates}>
          {TEMPLATES.map(t => (
            <Button
              key={t.label}
              label={t.label}
              kind={s.walkSec === t.walkSec && s.runSec === t.runSec ? 'primary' : 'secondary'}
              color={colors.walk}
              style={{ flexGrow: 1 }}
              onPress={() => {
                setNameTouched(false);
                setS(t);
              }}
            />
          ))}
        </View>
      </Section>

      <Card style={{ gap: space.md }}>
        <Text style={type.dim}>Name</Text>
        <TextInput
          value={s.name}
          onChangeText={name => {
            setNameTouched(true);
            setS(prev => ({ ...prev, name }));
          }}
          style={styles.input}
          placeholderTextColor={colors.textDim}
          placeholder="My workout"
        />
      </Card>

      <Card>
        <Stepper label="Warm up walk" value={s.warmupMin} step={1} min={0} max={20} format={v => (v ? `${v} min` : 'None')} color={colors.easy} onChange={warmupMin => set({ warmupMin })} />
        <View style={styles.repeat}>
          <Stepper label="Repeat" value={s.rounds} step={1} min={1} max={30} format={v => `× ${v}`} onChange={rounds => set({ rounds })} />
          <Stepper label="Walk" value={s.walkSec} step={15} min={15} max={600} format={mmss} color={colors.walk} onChange={walkSec => set({ walkSec })} />
          <Stepper label="Run" value={s.runSec} step={15} min={15} max={1800} format={mmss} color={colors.run} onChange={runSec => set({ runSec })} />
        </View>
        <Stepper label="Cool down walk" value={s.cooldownMin} step={1} min={0} max={20} format={v => (v ? `${v} min` : 'None')} color={colors.easy} onChange={cooldownMin => set({ cooldownMin })} />
      </Card>

      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={type.heading}>Total</Text>
          <Text style={type.mid}>{formatClock(total)}</Text>
        </View>
        <StepStrip steps={flatten(workout)} currentIndex={-1} currentProgress={0} />
        <Text style={type.dim}>
          {s.rounds} rounds · {formatClock(s.rounds * s.runSec)} running in total
        </Text>
      </Card>

      <Button testID="save-workout" label="Save and use today" kind="primary" big onPress={() => void save()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  templates: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  input: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.sm,
    padding: space.md,
  },
  repeat: {
    borderLeftWidth: 3,
    borderLeftColor: colors.line,
    paddingLeft: space.md,
    marginVertical: space.sm,
  },
});
