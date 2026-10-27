import type { FlatStep } from '@run-coach/core';
import { StyleSheet, View } from 'react-native';
import { colors, phaseColor } from '../theme';

interface Props {
  steps: FlatStep[];
  currentIndex: number;
  /** 0..1 through the current step. */
  currentProgress: number;
}

/** Every step of the workout as a segment, sized by duration: done, current, upcoming at a glance. */
export function StepStrip({ steps, currentIndex, currentProgress }: Props) {
  const weight = (s: FlatStep) => s.durationSec ?? (s.distanceM ? s.distanceM / 3 : 60);
  return (
    <View style={styles.strip} accessibilityLabel={`Step ${currentIndex + 1} of ${steps.length}`}>
      {steps.map((s, i) => {
        const color = phaseColor(s.kind);
        const done = i < currentIndex;
        const current = i === currentIndex;
        return (
          <View key={i} style={[styles.segment, { flex: weight(s), backgroundColor: colors.surfaceHigh }]}>
            {(done || current) && (
              <View
                style={{
                  width: done ? '100%' : `${Math.round(currentProgress * 100)}%`,
                  height: '100%',
                  backgroundColor: color,
                  opacity: done ? 0.45 : 1,
                }}
              />
            )}
            {!done && !current && <View style={[styles.upcoming, { backgroundColor: color }]} />}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', height: 10, gap: 2 },
  segment: { borderRadius: 3, overflow: 'hidden' },
  upcoming: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, opacity: 0.6 },
});
