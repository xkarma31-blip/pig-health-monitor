import React, { useState, useEffect } from 'react';
import { Animated, View } from 'react-native';
import { useTheme } from '../../theme';

type SkeletonRowProps = {
  style?: any;
};

function SkeletonRow({ style }: SkeletonRowProps) {
  const { colors, radius } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        { height: 58, backgroundColor: colors.divider, borderRadius: radius.md, opacity, marginBottom: 10 },
        style,
      ]}
    />
  );
}

type SkeletonProps = {
  rows?: number;
};

export function Skeleton({ rows = 4 }: SkeletonProps) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
