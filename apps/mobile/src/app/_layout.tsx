// Defines the background GPS task at startup, before any screen mounts.
import '../services/locationTask';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { boot } from '../services/runtime';
import { colors } from '../theme';

export default function RootLayout() {
  // Settings and any interrupted run load here, whichever screen the app opens on.
  useEffect(() => {
    void boot();
  }, []);

  const stack = (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg }, animation: 'slide_from_right' }}>
      {/* No swipe-back out of a live run. */}
      <Stack.Screen name="run" options={{ gestureEnabled: false, animation: 'fade' }} />
    </Stack>
  );
  return (
    <>
      <StatusBar style="light" />
      {Platform.OS === 'web' ? (
        // The browser build is for trying the app: show it at phone width.
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 430, alignSelf: 'center' }}>{stack}</View>
        </View>
      ) : (
        stack
      )}
    </>
  );
}
