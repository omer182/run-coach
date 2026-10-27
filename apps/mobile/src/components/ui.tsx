import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, type } from '../theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Header({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
      ) : (
        <View />
      )}
      {right}
      <Text style={[type.title, styles.headerTitle]}>{title}</Text>
    </View>
  );
}

type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  kind = 'secondary',
  color,
  big,
  disabled,
  style,
  testID,
}: {
  label: string;
  onPress(): void;
  kind?: ButtonKind;
  color?: string;
  big?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const bg = kind === 'primary' ? (color ?? colors.run) : kind === 'danger' ? colors.danger : kind === 'ghost' ? 'transparent' : colors.surfaceHigh;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: colors.line },
        style,
      ]}
    >
      <Text style={[styles.buttonLabel, big && styles.buttonLabelBig, kind === 'primary' && { color: '#0A0B0D' }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.8 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.big, color ? { color } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
        {unit ? <Text style={type.unit}> {unit}</Text> : null}
      </Text>
      <Text style={type.unit}>{label.toUpperCase()}</Text>
    </View>
  );
}

/** − value + with big touch targets; `format` renders the value. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min,
  max,
  format = String,
  color,
}: {
  label: string;
  value: number;
  onChange(v: number): void;
  step: number;
  min: number;
  max: number;
  format?: (v: number) => string;
  color?: string;
}) {
  return (
    <View style={styles.stepper}>
      <View style={{ flex: 1 }}>
        <Text style={type.dim}>{label}</Text>
        <Text style={[type.mid, color ? { color } : null]}>{format(value)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Less ${label}`}
        onPress={() => onChange(Math.max(min, value - step))}
        style={styles.stepBtn}
      >
        <Text style={styles.stepBtnText}>−</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`More ${label}`}
        onPress={() => onChange(Math.min(max, value + step))}
        style={styles.stepBtn}
      >
        <Text style={styles.stepBtnText}>+</Text>
      </Pressable>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', gap: space.md }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: 48, gap: space.lg },
  header: { gap: space.sm, marginBottom: space.xs },
  headerTitle: { marginTop: space.xs },
  back: { color: colors.walk, fontSize: 17, fontWeight: '600' },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonBig: { minHeight: 72, borderRadius: radius.lg },
  buttonLabel: { color: colors.text, fontSize: 16, fontWeight: '700' },
  buttonLabelBig: { fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg, gap: space.sm },
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { color: colors.textDim, fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  stat: { flex: 1, minWidth: 0 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.xs },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.surfaceHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { color: colors.text, fontSize: 28, fontWeight: '600', lineHeight: 32 },
});
