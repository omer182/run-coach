import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';
import type { RouteSegment } from '../summary';
import { colors, phaseColor, radius } from '../theme';

/** Browser stand-in for the map: the route drawn to scale, without map tiles. */
export function RouteMap({ segments, height = 260 }: { segments: RouteSegment[]; height?: number }) {
  const [width, setWidth] = useState(0);
  const all = segments.flatMap(s => s.coords);
  if (all.length < 2) return <View style={[styles.wrap, { height }]} />;

  const lats = all.map(c => c.latitude);
  const lons = all.map(c => c.longitude);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * k, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const pad = 24;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const ox = (width - spanX * scale) / 2;
  const oy = (height - spanY * scale) / 2;
  const pt = (c: { latitude: number; longitude: number }) =>
    `${(ox + (c.longitude - minLon) * k * scale).toFixed(1)},${(oy + (maxLat - c.latitude) * scale).toFixed(1)}`;
  const start = pt(all[0]!).split(',').map(Number);
  const end = pt(all[all.length - 1]!).split(',').map(Number);

  return (
    <View style={[styles.wrap, { height }]} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {segments.map((s, i) => (
            <Polyline
              key={i}
              points={s.coords.map(pt).join(' ')}
              stroke={phaseColor(s.kind)}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          ))}
          <Circle cx={start[0]} cy={start[1]} r={6} fill={colors.success} />
          <Circle cx={end[0]} cy={end[1]} r={6} fill={colors.text} />
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface } });
