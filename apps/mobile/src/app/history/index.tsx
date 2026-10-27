import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Text } from 'react-native';
import { Header, Screen } from '../../components/ui';
import { db } from '../../services/db';
import type { RunRow } from '../../services/dbTypes';
import { type } from '../../theme';
import { RunListItem } from '../../components/RunListItem';

export default function History() {
  const router = useRouter();
  const [runs, setRuns] = useState<RunRow[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      void db.listRuns(500).then(setRuns);
    }, []),
  );

  return (
    <Screen>
      <Header title="All runs" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      {runs?.length === 0 && <Text style={type.dim}>No runs yet. Your first one is a tap away.</Text>}
      {runs?.map(r => <RunListItem key={r.id} run={r} onPress={() => router.push(`/history/${r.id}`)} />)}
    </Screen>
  );
}
