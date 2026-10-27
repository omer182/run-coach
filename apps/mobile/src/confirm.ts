import { Alert, Platform } from 'react-native';

/** A yes/no question that also works in the browser build, where Alert is a no-op. */
export function confirm(title: string, message: string, yesLabel: string, destructive = true): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise(resolve =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: yesLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]),
  );
}

export function notify(title: string, message: string): Promise<void> {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
    return Promise.resolve();
  }
  return new Promise(resolve => Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }]));
}
