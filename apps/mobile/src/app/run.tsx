import { flatten, formatClock, formatPace, stepName, type Workout } from '@run-coach/core';
import * as Haptics from 'expo-haptics';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HoldButton } from '../components/HoldButton';
import { StepStrip } from '../components/StepStrip';
import { Button } from '../components/ui';
import { controller, discardRun, finishRun, pauseRun, resumeRun, skipStep, startRun, useRun } from '../services/runtime';
import { useSettings } from '../services/settings';
import { fake, openAppSettings } from '../services/tracking';
import { speakCue } from '../services/voice';
import { colors, phaseColor, phaseLabel, radius, space, type } from '../theme';
import { confirm, notify } from '../confirm';
import { db } from '../services/db';
import { PRESETS } from '../workouts';

export default function RunScreen() {
  const router = useRouter();
  const { workoutId } = useLocalSearchParams<{ workoutId?: string }>();
  const settings = useSettings();
  const run = useRun();
  const [countdown, setCountdown] = useState<number | null>(controller.active ? null : 3);
  const [warning, setWarning] = useState<{ text: string; openSettings?: boolean } | null>(null);
  // A run already in progress (or recovered after a crash) means this screen must never start another.
  const startedRef = useRef(controller.active);

  // undefined while a saved workout is still loading, so we never start the wrong one.
  const [chosen, setChosen] = useState<Workout | null | undefined>(() =>
    !workoutId || workoutId === 'free' ? null : PRESETS.find(w => w.id === workoutId),
  );
  useEffect(() => {
    if (chosen !== undefined) return;
    void db.listWorkouts().then(list => setChosen(list.find(w => w.id === workoutId) ?? null));
  }, [chosen, workoutId]);
  const workout = controller.active ? run.workout : chosen;

  // 3-2-1, tap to skip, then go.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown === 0) {
      setCountdown(null);
      return;
    }
    speakCue(String(countdown));
    const t = setTimeout(() => setCountdown(c => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (countdown != null || controller.active || startedRef.current || workout === undefined) return;
    startedRef.current = true;
    void startRun(workout).then(async result => {
      if (result.ok) return;
      if (!controller.active) {
        await notify('Location needed', result.reason);
        if (result.openSettings) openAppSettings();
        router.back();
      } else {
        setWarning({ text: result.reason, openSettings: result.openSettings });
      }
    });
  }, [countdown, workout, router]);

  // Smooth countdown while the screen is on; in the background GPS drives the clock.
  useEffect(() => {
    const t = setInterval(() => controller.tick(), 500);
    return () => clearInterval(t);
  }, []);

  if (countdown != null) {
    return (
      <Pressable style={[styles.fill, styles.center]} onPress={() => setCountdown(0)} accessibilityLabel="Skip countdown">
        <Text style={type.dim}>{workout?.name ?? 'Free run'}</Text>
        <Text style={[type.hero, { fontSize: 180, lineHeight: 190, color: colors.run }]}>{countdown}</Text>
        <Text style={type.dim}>Tap to skip</Text>
      </Pressable>
    );
  }

  return <Live workoutSteps={workout ? flatten(workout) : []} warning={warning} onWarningPress={() => warning?.openSettings && openAppSettings()} keepAwake={settings.keepAwake} simulate={Platform.OS === 'web' || settings.simulateGps} />;
}

function KeepAwake() {
  useKeepAwake();
  return null;
}

function Live({
  workoutSteps,
  warning,
  onWarningPress,
  keepAwake,
  simulate,
}: {
  workoutSteps: ReturnType<typeof flatten>;
  warning: { text: string } | null;
  onWarningPress(): void;
  keepAwake: boolean;
  simulate: boolean;
}) {
  const router = useRouter();
  const run = useRun();
  const s = run.state;
  const flash = useRef(new Animated.Value(0)).current;
  const lastStep = useRef<number | null>(null);
  const [ending, setEnding] = useState(false);

  const noWorkout = workoutSteps.length === 0;
  const kind = s?.workoutDone ? undefined : s?.step?.kind;
  const paused = s?.status === 'paused';
  const accent = paused ? colors.paused : noWorkout ? colors.run : s?.workoutDone ? colors.success : phaseColor(kind);

  // Phase change: flood the screen with the new colour and buzz, so a glance isn't needed.
  useEffect(() => {
    if (!s || s.stepIndex === lastStep.current) return;
    const first = lastStep.current == null;
    lastStep.current = s.stepIndex;
    if (first) return;
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 900, useNativeDriver: true }).start();
    if (Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [s, flash]);

  if (!s) return <View style={styles.fill} />;

  const coachLine = run.log.find(l => l.kind === 'coach');
  const trend = run.log.find(l => l.kind === 'trend');
  const freeRun = noWorkout || s.workoutDone;
  const stepTotal = s.step?.durationSec ?? s.step?.distanceM ?? 1;
  const stepDone = s.step?.durationSec != null ? s.stepElapsedSec : s.step?.distanceM != null ? s.step.distanceM - (s.stepRemainingM ?? 0) : 0;
  const progress = Math.min(1, stepDone / stepTotal);

  let hero: string;
  let heroLabel: string;
  if (freeRun) {
    hero = formatClock(s.elapsedSec);
    heroLabel = noWorkout ? 'TIME' : 'WORKOUT DONE · KEEP GOING OR END';
  } else if (s.stepRemainingSec != null) {
    hero = formatClock(s.stepRemainingSec);
    heroLabel = 'LEFT IN THIS STEP';
  } else {
    hero = `${Math.round(s.stepRemainingM ?? 0)}`;
    heroLabel = 'METERS TO GO';
  }

  const band = paused
    ? 'PAUSED'
    : noWorkout
      ? 'FREE RUN'
      : s.workoutDone
      ? 'DONE'
      : `${phaseLabel(kind)}${s.step?.round ? ` · ${s.step.round}/${s.step.rounds}` : ''}`;

  const end = async () => {
    setEnding(true);
    const id = await finishRun();
    router.replace(id ? { pathname: '/history/[id]', params: { id, fresh: '1' } } : '/');
  };

  const discard = async () => {
    if (!(await confirm('Discard this run?', "It won't be saved.", 'Discard'))) return;
    await discardRun();
    router.replace('/');
  };

  return (
    <View style={styles.fill}>
      {keepAwake && <KeepAwake />}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: accent, opacity: flash }]} />
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={[styles.band, { backgroundColor: accent }]}>
          <Text style={styles.bandText} testID="phase">
            {band}
          </Text>
        </View>

        <View style={styles.body}>
          {warning && (
            <Pressable onPress={onWarningPress} style={styles.warning}>
              <Text style={styles.warningText}>{warning.text}</Text>
            </Pressable>
          )}

          <View style={styles.heroWrap}>
            <Text style={[type.hero, { color: paused ? colors.paused : colors.text }]} testID="hero" numberOfLines={1} adjustsFontSizeToFit>
              {hero}
            </Text>
            <Text style={type.unit}>{heroLabel}</Text>
          </View>

          {!freeRun && (
            <View style={{ gap: space.sm }}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: accent }]} />
              </View>
              <StepStrip steps={workoutSteps} currentIndex={s.stepIndex} currentProgress={progress} />
              <Text style={styles.next}>
                {s.next
                  ? `Next: ${stepName(s.next).toUpperCase()} ${s.next.durationSec != null ? formatClock(s.next.durationSec) : `${s.next.distanceM} m`}`
                  : 'Last step'}
              </Text>
            </View>
          )}

          <View style={styles.twoUp}>
            <View style={{ flex: 1 }}>
              <Text style={type.big}>{freeRun ? `${(s.distanceM / 1000).toFixed(2)}` : formatClock(s.elapsedSec)}</Text>
              <Text style={type.unit}>{freeRun ? 'KM' : 'TOTAL TIME'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.big}>{freeRun ? formatPace(s.paceSecPerKm) : (s.distanceM / 1000).toFixed(2)}</Text>
              <Text style={type.unit}>{freeRun ? 'PACE /KM' : 'KM'}</Text>
            </View>
          </View>
          <Text style={type.dim}>
            {freeRun ? '' : `Pace ${formatPace(s.paceSecPerKm)} /km · `}Climb +{Math.round(s.climbM)} m
          </Text>

          {(coachLine || run.coachBusy) && (
            <View style={styles.coach}>
              <Text style={styles.coachLabel}>COACH{trend && trend === run.log[0] ? ` · ${trend.text.toUpperCase()}` : ''}</Text>
              <Text style={styles.coachText} numberOfLines={3}>
                {coachLine?.text ?? '…'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.controls}>
          {simulate && !paused && (
            <View style={styles.simRow}>
              <Text style={type.dim}>Simulated GPS · run {fake.runKmh} km/h</Text>
              <Pressable onPress={() => fake.nudge(0.8)} style={styles.simBtn}>
                <Text style={styles.simText}>Get tired</Text>
              </Pressable>
              <Pressable onPress={() => fake.nudge(1.25)} style={styles.simBtn}>
                <Text style={styles.simText}>Feel strong</Text>
              </Pressable>
            </View>
          )}
          {paused ? (
            <>
              <Button testID="resume" label="RESUME" kind="primary" color={colors.success} big onPress={() => void resumeRun()} />
              <HoldButton testID="end" label={ending ? 'Saving…' : 'End run'} onComplete={() => void end()} />
              <Pressable onPress={() => void discard()} style={{ alignSelf: 'center', padding: space.sm }}>
                <Text style={type.dim}>Discard run</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.runningButtons}>
              <Button testID="pause" label="PAUSE" big style={{ flex: 1, borderWidth: 2, borderColor: colors.paused }} onPress={pauseRun} />
              {!freeRun && <Button testID="skip" label="Skip" big kind="ghost" style={{ width: 96 }} onPress={skipStep} />}
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  band: { marginHorizontal: space.lg, marginTop: space.sm, borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  bandText: { color: '#0A0B0D', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  body: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  heroWrap: { alignItems: 'center' },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  progressFill: { height: 6 },
  next: { color: colors.textDim, fontSize: 17, fontWeight: '700', letterSpacing: 0.5 },
  twoUp: { flexDirection: 'row', gap: space.lg },
  coach: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md, gap: 4 },
  coachLabel: { color: colors.run, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  coachText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  controls: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.md },
  runningButtons: { flexDirection: 'row', gap: space.md },
  warning: { backgroundColor: '#3a2a08', borderRadius: radius.sm, padding: space.md },
  warningText: { color: colors.paused, fontSize: 14 },
  simRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  simBtn: { backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 6 },
  simText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
