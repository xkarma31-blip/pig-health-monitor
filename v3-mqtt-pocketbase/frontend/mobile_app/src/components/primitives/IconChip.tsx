import React, { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme';

type IconChipProps = {
  background: string;
  size?: number;
  children: ReactNode;
};

export function IconChip({ background, size = 34, children }: IconChipProps) {
  const { radius } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size >= 40 ? radius.md : radius.sm,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </View>
  );
}
