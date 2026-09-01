import React, { ReactNode, isValidElement, Children } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../theme';

type ListGroupProps = {
  children: ReactNode;
};

export function ListGroup({ children }: ListGroupProps) {
  const { colors, radius } = useTheme();
  const items = Children.toArray(children).filter(isValidElement);

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        overflow: 'hidden',
      }}
    >
      {items.map((child, i) => (
        <View key={i}>
          {child}
          {i < items.length - 1 && (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                marginLeft: 16,
                backgroundColor: colors.divider,
              }}
            />
          )}
        </View>
      ))}
    </View>
  );
}
