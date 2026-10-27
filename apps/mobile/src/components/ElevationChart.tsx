import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, type } from '../theme';

interface Props {
  /** Altitude against distance from the start (not time: a pause would flatten a hill). */
  points: { distanceM: number; altM: number }[];
  height?: number;
}

export function ElevationChart({ points, height = 120 }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length < 2) {
    return <Text style={type.dim}>No elevation data for this run.</Text>;
  }

  const pad = { top: 8, bottom: 18, left: 0, right: 0 };
  const maxD = points[points.length - 1]!.distanceM || 1;
  const alts = points.map(p => p.altM);
  const lo = Math.min(...alts);
  const hi = Math.max(...alts);
  // Keep at least 10 m of range so a flat run doesn't look like the Alps.
  const span = Math.max(hi - lo, 10);
  const base = lo - (span - (hi - lo)) / 2;
  const x = (d: number) => pad.left + (d / maxD) * (width - pad.left - pad.right);
  const y = (a: number) => pad.top + (1 - (a - base) / span) * (height - pad.top - pad.bottom);

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.distanceM).toFixed(1)} ${y(p.altM).toFixed(1)}`).join(' ');
  const area = `${line} L${x(maxD).toFixed(1)} ${height - pad.bottom} L${x(0).toFixed(1)} ${height - pad.bottom} Z`;

  return (
    <View onLayout={onLayout} style={styles.wrap}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Path d={area} fill={colors.walk} fillOpacity={0.18} />
          <Path d={line} stroke={colors.walk} strokeWidth={2} fill="none" />
          <Line x1={0} x2={width} y1={height - pad.bottom} y2={height - pad.bottom} stroke={colors.line} />
          <SvgText x={2} y={height - 4} fill={colors.textDim} fontSize={11}>
            0 km
          </SvgText>
          <SvgText x={width - 2} y={height - 4} fill={colors.textDim} fontSize={11} textAnchor="end">
            {(maxD / 1000).toFixed(1)} km
          </SvgText>
          <SvgText x={2} y={pad.top + 10} fill={colors.textDim} fontSize={11}>
            {Math.round(hi)} m
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { width: '100%' } });
