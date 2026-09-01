import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';
import { PulseIcon } from './Icons';

export function LogoMark({ size = 32 }: { size?: number }) {
  const { colors, radius } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        backgroundColor: colors.accent,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <PulseIcon size={size * 0.55} color={colors.onAccent} />
    </View>
  );
}
