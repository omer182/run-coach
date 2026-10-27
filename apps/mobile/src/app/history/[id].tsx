import { formatClock, formatPace } from '@run-coach/core';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ElevationChart } from '../../components/ElevationChart';
import { RouteMap } from '../../components/RouteMap';
import { Button, Card, Header, Row, Screen, Section, Stat } from '../../components/ui';
import { confirm } from '../../confirm';
import { db } from '../../services/db';
import type { RunRow } from '../../services/dbTypes';
import { summarize, type RunSummary } from '../../summary';
import { colors, radius, space, type } from '../../theme';

/** Saved confirmation, headline stats, route, elevation by distance, then the details. */
export default function RunDetail() {
  const router = useRouter();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const [run, setRun] = useState<RunRow | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    void (async () => {
      const row = await db.getRun(id);
      if (!row) return setMissing(true);
      const [points, controls] = await Promise.all([db.getPoints(id), db.getControls(id)]);
      setRun(row);
      setSummary(summarize(row, points, controls));
    })();
  }, [id]);

  const goHome = () => (fresh ? router.replace('/') : router.back());

  if (missing) {
    return (
      <Screen>
        <Header title="Run not found" onBack={goHome} />
      </Screen>
    );
  }
  if (!run || !summary) return <Screen>{null}</Screen>;

  const { state } = summary;
  const avgPace = state.distanceM > 50 ? (state.elapsedSec / state.distanceM) * 1000 : null;
  const date = new Date(run.startedAt).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const runPaces = summary.rounds.map(r => r.run).filter((p): p is number => p != null);
  const slowest = Math.max(...runPaces, 1);

  const remove = async () => {
    if (!(await confirm('Delete this run?', 'This can’t be undone.', 'Delete'))) return;
    await db.deleteRun(run.id);
    goHome();
  };

  return (
    <Screen>
      <Header title={run.name} onBack={goHome} />
      {fresh && (
        <View style={styles.saved}>
          <Text style={styles.savedText}>Run saved. Nice work.</Text>
        </View>
      )}
      <Text style={type.dim}>{date}</Text>

      <Card>
        <Row>
          <Stat label="Distance" value={(state.distanceM / 1000).toFixed(2)} unit="km" />
          <Stat label="Time" value={formatClock(state.elapsedSec)} />
        </Row>
        <Row style={{ marginTop: space.md }}>
          <Stat label="Avg pace" value={formatPace(avgPace)} unit="/km" />
          <Stat label="Climb" value={`+${Math.round(state.climbM)}`} unit="m" />
        </Row>
      </Card>

      {summary.segments.length > 0 && (
        <Section title="Route">
          <RouteMap segments={summary.segments} />
          <View style={styles.legend}>
            <Legend color={colors.run} label="Run" />
            <Legend color={colors.walk} label="Walk" />
            <Legend color={colors.easy} label="Warm up / cool down" />
          </View>
        </Section>
      )}

      <Section title="Elevation">
        <Card>
          <ElevationChart points={summary.elevation} />
        </Card>
      </Section>

      {summary.rounds.length > 0 && (
        <Section title="Rounds">
          <Card style={{ gap: space.md }}>
            <View style={styles.tableHead}>
              <Text style={[type.unit, { width: 36 }]}>#</Text>
              <Text style={[type.unit, { width: 64 }]}>WALK</Text>
              <Text style={[type.unit, { flex: 1 }]}>RUN PACE /KM</Text>
            </View>
            {summary.rounds.map(r => (
              <View key={r.round} style={styles.roundRow}>
                <Text style={[type.body, { width: 36, color: colors.textDim }]}>{r.round}</Text>
                <Text style={[type.body, { width: 64, color: colors.walk }]}>{formatPace(r.walk)}</Text>
                <View style={styles.barWrap}>
                  {r.run != null && <View style={[styles.bar, { width: `${Math.max(12, (r.run / slowest) * 100)}%` }]} />}
                  <Text style={styles.barText}>{formatPace(r.run)}</Text>
                </View>
              </View>
            ))}
            <Text style={type.dim}>Shorter bars are faster rounds.</Text>
          </Card>
        </Section>
      )}

      {state.splitsSec.length > 0 && (
        <Section title="Kilometers">
          <Card style={{ gap: space.sm }}>
            {state.splitsSec.map((sec, i) => (
              <View key={i} style={styles.splitRow}>
                <Text style={[type.body, { color: colors.textDim }]}>km {i + 1}</Text>
                <Text style={type.body}>{formatClock(sec)}</Text>
              </View>
            ))}
          </Card>
        </Section>
      )}

      {fresh && <Button label="Done" kind="primary" big onPress={goHome} />}
      <Button label="Delete run" kind="ghost" onPress={() => void remove()} />
    </Screen>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={type.dim}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  saved: { backgroundColor: '#123524', borderRadius: radius.md, padding: space.md },
  savedText: { color: colors.success, fontWeight: '700', fontSize: 16 },
  legend: { flexDirection: 'row', gap: space.lg, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  tableHead: { flexDirection: 'row' },
  roundRow: { flexDirection: 'row', alignItems: 'center' },
  barWrap: { flex: 1, height: 26, justifyContent: 'center' },
  bar: { position: 'absolute', left: 0, top: 2, bottom: 2, backgroundColor: colors.run, opacity: 0.35, borderRadius: 4 },
  barText: { color: colors.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], paddingLeft: space.sm },
  splitRow: { flexDirection: 'row', justifyContent: 'space-between' },
});
