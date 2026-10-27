import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Polyline } from 'react-native-maps';
import type { RouteSegment } from '../summary';
import { phaseColor, radius } from '../theme';

/** Apple Maps on iOS (no API key), route coloured by walk and run. */
export function RouteMap({ segments, height = 260 }: { segments: RouteSegment[]; height?: number }) {
  const ref = useRef<MapView>(null);
  const all = segments.flatMap(s => s.coords);

  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle="dark"
        pitchEnabled={false}
        toolbarEnabled={false}
        onLayout={() =>
          all.length > 1 &&
          ref.current?.fitToCoordinates(all, { edgePadding: { top: 32, right: 32, bottom: 32, left: 32 }, animated: false })
        }
      >
        {segments.map((s, i) => (
          <Polyline key={i} coordinates={s.coords} strokeColor={phaseColor(s.kind)} strokeWidth={5} lineCap="round" lineJoin="round" />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { borderRadius: radius.md, overflow: 'hidden' } });
