import type { CoachProfile } from '@run-coach/core';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Button, Card, Header, Screen, Section } from '../components/ui';
import { getProfile, saveProfile, testConnection } from '../services/coachClient';
import { parsePace, updateSettings, useSettings } from '../services/settings';
import { colors, radius, space, type } from '../theme';

export default function SettingsScreen() {
  const router = useRouter();
  const s = useSettings();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [profile, setProfile] = useState<CoachProfile | null>(null);
  const [whyText, setWhyText] = useState('');
  const [profileStatus, setProfileStatus] = useState('');

  const test = async () => {
    setTesting(true);
    setStatus(await testConnection());
    setTesting(false);
  };

  const loadProfile = async () => {
    try {
      const p = await getProfile();
      setProfile(p);
      setWhyText(p.why.join('\n'));
      setProfileStatus('');
    } catch (err) {
      setProfileStatus((err as Error).message);
    }
  };

  const storeProfile = async () => {
    if (!profile) return;
    try {
      const why = whyText.split('\n').map(w => w.trim()).filter(Boolean);
      setProfile(await saveProfile({ ...profile, why }));
      setProfileStatus('Saved. The coach will use this on your next run.');
    } catch (err) {
      setProfileStatus((err as Error).message);
    }
  };

  const paceInvalid = s.usualPace.trim() !== '' && parsePace(s.usualPace) == null;

  return (
    <Screen>
      <Header title="Settings" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))} />

      <Section title="Coach server">
        <Card style={{ gap: space.md }}>
          <Field label="Address" value={s.serverUrl} placeholder="http://192.168.0.147:3020" autoCapitalize="none" autoCorrect={false} keyboardType="url" onChangeText={serverUrl => void updateSettings({ serverUrl })} />
          <Field label="App key" value={s.appKey} placeholder="APP_API_KEY from the server's .env" autoCapitalize="none" autoCorrect={false} secureTextEntry onChangeText={appKey => void updateSettings({ appKey })} />
          <Toggle label="AI coach during runs" value={s.coachEnabled} onChange={coachEnabled => void updateSettings({ coachEnabled })} />
          <Button label={testing ? 'Testing…' : 'Test connection'} onPress={() => void test()} />
          {status && <Text style={{ color: status.ok ? colors.success : colors.danger }}>{status.message}</Text>}
        </Card>
      </Section>

      <Section title="Your why">
        <Card style={{ gap: space.md }}>
          {!profile ? (
            <>
              <Text style={type.dim}>What the coach knows about you: your name, goal and why you run. It brings these up when it gets hard.</Text>
              <Button label="Load from server" onPress={() => void loadProfile()} />
            </>
          ) : (
            <>
              <Field label="Name" value={profile.name ?? ''} placeholder="Omer" onChangeText={name => setProfile({ ...profile, name })} />
              <Field label="Goal" value={profile.goal ?? ''} placeholder="Run 5K without stopping by March" onChangeText={goal => setProfile({ ...profile, goal })} />
              <Field label="Why I run (one per line)" value={whyText} multiline placeholder={'Keep up with my kids\nClear my head after work'} onChangeText={setWhyText} />
              <View style={styles.personalities}>
                {(['friendly', 'calm', 'tough'] as const).map(p => (
                  <Button key={p} label={p[0]!.toUpperCase() + p.slice(1)} kind={profile.personality === p ? 'primary' : 'secondary'} style={{ flex: 1 }} onPress={() => setProfile({ ...profile, personality: p })} />
                ))}
              </View>
              <Button label="Save" kind="primary" color={colors.walk} onPress={() => void storeProfile()} />
            </>
          )}
          {profileStatus ? <Text style={type.dim}>{profileStatus}</Text> : null}
        </Card>
      </Section>

      <Section title="Running">
        <Card style={{ gap: space.md }}>
          <Field label="Usual run pace (min:sec per km)" value={s.usualPace} placeholder="6:40" keyboardType="numbers-and-punctuation" onChangeText={usualPace => void updateSettings({ usualPace })} />
          {paceInvalid && <Text style={{ color: colors.danger }}>Use minutes:seconds, like 6:40.</Text>}
          <Text style={type.dim}>Used to warn you when you start out too fast.</Text>
          <Toggle label="Keep screen on during runs" value={s.keepAwake} onChange={keepAwake => void updateSettings({ keepAwake })} />
          <Toggle label="Simulated GPS (for testing indoors)" value={s.simulateGps} onChange={simulateGps => void updateSettings({ simulateGps })} />
        </Card>
      </Section>
    </Screen>
  );
}

function Field({ label, ...input }: { label: string } & TextInputProps) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={type.dim}>{label}</Text>
      <TextInput {...input} style={[styles.input, input.multiline && { minHeight: 88, textAlignVertical: 'top' }]} placeholderTextColor="#5a616b" />
    </View>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange(v: boolean): void }) {
  return (
    <View style={styles.toggle}>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.run, false: colors.surfaceHigh }} />
    </View>
  );
}

const styles = StyleSheet.create({
  input: { color: colors.text, fontSize: 16, backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, padding: space.md },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  personalities: { flexDirection: 'row', gap: space.sm },
});
