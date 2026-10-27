import type { StepKind } from '@run-coach/core';
import type { TextStyle } from 'react-native';

/** Dark everywhere: it is read outdoors at a glance, mid-run, often in bright light or at night. */
export const colors = {
  bg: '#0A0B0D',
  surface: '#16181C',
  surfaceHigh: '#20232A',
  line: '#2A2E36',
  text: '#F4F6F8',
  textDim: '#8B939E',
  run: '#FF5A1F',
  walk: '#2EC4F1',
  easy: '#9B8CFF',
  paused: '#FFC53D',
  danger: '#FF4D4F',
  success: '#3DDC84',
} as const;

/** Phase colour per step kind. Always paired with a text label, never colour alone. */
export function phaseColor(kind: StepKind | undefined): string {
  switch (kind) {
    case 'run':
    case 'fast':
      return colors.run;
    case 'walk':
    case 'rest':
      return colors.walk;
    case 'warmup':
    case 'cooldown':
    case 'easy':
      return colors.easy;
    default:
      return colors.textDim;
  }
}

export function phaseLabel(kind: StepKind | undefined): string {
  switch (kind) {
    case 'warmup':
      return 'WARM UP';
    case 'cooldown':
      return 'COOL DOWN';
    case undefined:
      return 'FREE RUN';
    default:
      return kind.toUpperCase();
  }
}

/** Fixed-width digits so numbers don't jitter as they tick. */
const digits: TextStyle = { fontVariant: ['tabular-nums'], fontWeight: '800', color: colors.text };

export const type = {
  hero: { ...digits, fontSize: 112, letterSpacing: -4, lineHeight: 120 } satisfies TextStyle,
  big: { ...digits, fontSize: 36, letterSpacing: -1 } satisfies TextStyle,
  mid: { ...digits, fontSize: 24 } satisfies TextStyle,
  unit: { fontSize: 13, fontWeight: '600', letterSpacing: 1, color: colors.textDim } satisfies TextStyle,
  title: { fontSize: 28, fontWeight: '800', color: colors.text } satisfies TextStyle,
  heading: { fontSize: 17, fontWeight: '700', color: colors.text } satisfies TextStyle,
  body: { fontSize: 15, color: colors.text } satisfies TextStyle,
  dim: { fontSize: 13, color: colors.textDim } satisfies TextStyle,
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 22 } as const;
