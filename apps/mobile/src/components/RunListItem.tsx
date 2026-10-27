import { formatClock, formatPace } from '@run-coach/core';
import { StyleSheet, Text, View } from 'react-native';
import type { RunRow } from '../services/dbTypes';
import { type } from '../theme';
import { Card } from './ui';

export function RunListItem({ run, onPress }: { run: RunRow; onPress(): void }) {
  const date = new Date(run.startedAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const pace = run.distanceM > 50 ? (run.elapsedSec / run.distanceM) * 1000 : null;
  return (
    <Card onPress={onPress} style={styles.runItem}>
      <View style={{ flex: 1 }}>
        <Text style={type.heading} numberOfLines={1}>
          {run.name}
        </Text>
        <Text style={type.dim}>{date}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={type.mid}>{(run.distanceM / 1000).toFixed(2)} km</Text>
        <Text style={type.dim}>
          {formatClock(run.elapsedSec)} · {formatPace(pace)} /km
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  runItem: { flexDirection: 'row', alignItems: 'center' },
});
