import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

interface Props {
  label: string;
  /** Shown while held. */
  holdingLabel?: string;
  color?: string;
  holdMs?: number;
  onComplete(): void;
  testID?: string;
}

/** Press and hold to confirm, so a pocket tap can never end a run. */
export function HoldButton({ label, holdingLabel = 'Keep holding…', color = colors.danger, holdMs = 1200, onComplete, testID }: Props) {
  const progress = useRef(new Animated.Value(0)).current;
  const holding = useRef(false);
  const [isHolding, setIsHolding] = useState(false);

  const begin = () => {
    holding.current = true;
    setIsHolding(true);
    Animated.timing(progress, { toValue: 1, duration: holdMs, useNativeDriver: false }).start(({ finished }) => {
      if (finished && holding.current) {
        holding.current = false;
        setIsHolding(false);
        progress.setValue(0);
        onComplete();
      }
    });
  };

  const cancel = () => {
    holding.current = false;
    setIsHolding(false);
    Animated.timing(progress, { toValue: 0, duration: 150, useNativeDriver: false }).start();
  };

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Press and hold.`}
      onPressIn={begin}
      onPressOut={cancel}
      style={[styles.button, { borderColor: color }]}
    >
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
      <View style={styles.labelWrap} pointerEvents="none">
        <Text style={styles.label}>{isHolding ? holdingLabel : label}</Text>
        <Text style={styles.hint}>Hold</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 72,
    borderRadius: radius.lg,
    borderWidth: 2,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.85 },
  labelWrap: { alignItems: 'center' },
  label: { color: colors.text, fontSize: 18, fontWeight: '800' },
  hint: { color: colors.textDim, fontSize: 11, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
});
