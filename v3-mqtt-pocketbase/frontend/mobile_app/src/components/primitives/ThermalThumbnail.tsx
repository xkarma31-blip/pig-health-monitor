import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../../theme';

type ThermalThumbnailProps = {
  width?: number;
  height?: number;
};

const HEAT_STOPS = [
  { offset: '0%', color: '#fff3c4' },
  { offset: '14%', color: '#ffcf56' },
  { offset: '26%', color: '#fb9a2d' },
  { offset: '38%', color: '#f45b28' },
  { offset: '52%', color: '#c81d5e' },
  { offset: '68%', color: '#6e1e8c' },
  { offset: '84%', color: '#2a1a5e' },
  { offset: '100%', color: '#10102e' },
];

export function ThermalThumbnail({ width = 52, height = 44 }: ThermalThumbnailProps) {
  const { radius } = useTheme();
  const gridLines: React.ReactNode[] = [];
  const step = 7;
  for (let x = step; x < width; x += step) {
    gridLines.push(
      <Line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} stroke="white" strokeOpacity={0.16} strokeWidth={1} />
    );
  }
  for (let y = step; y < height; y += step) {
    gridLines.push(
      <Line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} stroke="white" strokeOpacity={0.16} strokeWidth={1} />
    );
  }

  return (
    <View style={{ width, height, borderRadius: radius.sm, overflow: 'hidden' }}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="heat" cx="62%" cy="58%" r="75%">
            {HEAT_STOPS.map((stop) => (
              <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#heat)" />
        {gridLines}
      </Svg>
    </View>
  );
}