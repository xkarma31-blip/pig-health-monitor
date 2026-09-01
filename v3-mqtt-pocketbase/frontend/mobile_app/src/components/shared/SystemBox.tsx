import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';

type SystemBoxProps = {
  title: string;
  path: string;
  description: string;
};

export function SystemBox({ title, path, description }: SystemBoxProps) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        padding: spacing.md,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.divider,
        marginBottom: spacing.xl,
      }}
      accessibilityLabel={`${title}: ${path}`}
      accessibilityHint={description}
    >
      <Text style={{ color: colors.textMuted, fontSize: 12, textTransform: 'uppercase', marginBottom: 4, fontWeight: '600' }}>
        {title}
      </Text>
      <Text style={{ color: colors.accent, fontFamily: 'monospace', fontSize: 12 }}>{path}</Text>
      <Text style={{ color: colors.textSecondary, fontSize: 10, marginTop: 6, fontStyle: 'italic' }}>{description}</Text>
    </View>
  );
}
