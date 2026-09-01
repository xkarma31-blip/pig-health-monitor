import React from 'react';
import Svg, { Polyline } from 'react-native-svg';

type SparklineProps = {
  trend: number[];
  color: string;
  width?: number;
  height?: number;
};

export function Sparkline({ trend, color, width = 44, height = 20 }: SparklineProps) {
  const pad = 2;
  const min = Math.min(...trend);
  const max = Math.max(...trend);
  const range = max - min || 1;

  const points = trend
    .map((v, i) => {
      const x = pad + (i / (trend.length - 1)) * (width - pad * 2);
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
