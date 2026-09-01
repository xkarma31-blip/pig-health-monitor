import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../../theme';
import { IconChip } from './IconChip';

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  message: string;
};

export function EmptyState({ icon, title, message }: EmptyStateProps) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: spacing.xl + 4,
        paddingHorizontal: spacing.lg,
      }}
      accessibilityLabel={title}
      accessibilityHint={message}
    >
      <IconChip background={colors.accentSoft} size={44}>
        {icon}
      </IconChip>
      <Text style={[typography.h2, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}>
        {title}
      </Text>
      <Text
        style={[
          typography.bodySmall,
          { color: colors.textMuted, marginTop: 6, textAlign: 'center', maxWidth: 230, fontSize: 12.5 },
        ]}
      >
        {message}
      </Text>
    </View>
  );
}
