import { flatten, formatClock } from '@run-coach/core';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { RunListItem } from '../components/RunListItem';
import { StepStrip } from '../components/StepStrip';
import { Button, Card, Row, Screen, Section, Stat } from '../components/ui';
import { coachConfigured } from '../services/coachClient';
import { db } from '../services/db';
import type { RunRow } from '../services/dbTypes';
import { boot, controller } from '../services/runtime';
import { useSettings } from '../services/settings';
import { colors, space, type } from '../theme';
import { useWorkouts } from '../useWorkouts';
import { describeWorkout, workoutMinutes } from '../workouts';

export default function Today() {
  const router = useRouter();
  const { selected } = useWorkouts();
  const settings = useSettings();
  const [runs, setRuns] = useState<RunRow[]>([]);

  // Pick up a run the app was killed in the middle of.
  useEffect(() => {
    // Only a run that is live right now; boot()'s result is cached and goes stale after a discard.
    void boot().then(() => {
      if (controller.active) router.replace('/run');
    });
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      void db.listRuns(50).then(setRuns);
    }, []),
  );

  const weekAgo = Date.now() - 7 * 864e5;
  const week = runs.filter(r => r.startedAt >= weekAgo);
  const weekKm = week.reduce((s, r) => s + r.distanceM, 0) / 1000;
  const weekSec = week.reduce((s, r) => s + r.elapsedSec, 0);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const coachOn = settings.coachEnabled && coachConfigured();

  return (
    <Screen>
      <View style={styles.top}>
        <Text style={type.dim}>{today}</Text>
        <Pressable onPress={() => router.push('/settings')} hitSlop={12} accessibilityRole="button">
          <Text style={styles.link}>Settings</Text>
        </Pressable>
      </View>
      <Text style={type.title}>Ready to run?</Text>

      <Card onPress={() => router.push('/workouts')} style={{ gap: space.md }}>
        <View style={styles.cardHead}>
          <Text style={styles.eyebrow}>TODAY</Text>
          <Text style={styles.link}>Change</Text>
        </View>
        <Text style={styles.workoutName}>{selected.name}</Text>
        <Text style={type.dim}>
          {describeWorkout(selected)} · about {workoutMinutes(selected)} min
        </Text>
        <StepStrip steps={flatten(selected)} currentIndex={-1} currentProgress={0} />
      </Card>

      <Button
        testID="start"
        label="START"
        kind="primary"
        big
        onPress={() => router.push({ pathname: '/run', params: { workoutId: selected.id } })}
      />
      <Button label="Free run, no intervals" kind="ghost" onPress={() => router.push({ pathname: '/run', params: { workoutId: 'free' } })} />

      {!coachOn && (
        <Card onPress={() => router.push('/settings')}>
          <Text style={type.heading}>Coach is off</Text>
          <Text style={type.dim}>Cues still work. Connect your coach server in Settings for the AI coach.</Text>
        </Card>
      )}

      <Section title="This week">
        <Card>
          <Row>
            <Stat label="Runs" value={String(week.length)} />
            <Stat label="Distance" value={weekKm.toFixed(1)} unit="km" />
            <Stat label="Time" value={formatClock(weekSec)} />
          </Row>
        </Card>
      </Section>

      <Section
        title="Recent"
        right={
          runs.length > 0 ? (
            <Pressable onPress={() => router.push('/history')} hitSlop={12}>
              <Text style={styles.link}>All runs</Text>
            </Pressable>
          ) : undefined
        }
      >
        {runs.length === 0 ? (
          <Text style={type.dim}>Your runs will show up here.</Text>
        ) : (
          runs.slice(0, 3).map(r => <RunListItem key={r.id} run={r} onPress={() => router.push(`/history/${r.id}`)} />)
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: colors.walk, fontSize: 15, fontWeight: '600' },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: colors.run, fontSize: 12, fontWeight: '800', letterSpacing: 1.5 },
  workoutName: { color: colors.text, fontSize: 26, fontWeight: '800' },
});
