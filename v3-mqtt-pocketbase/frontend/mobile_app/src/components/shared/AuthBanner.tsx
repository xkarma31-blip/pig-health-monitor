import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../theme';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';
import { LockIcon } from '../primitives/Icons';

type AuthBannerProps = {
  title: string;
  message: string;
  buttonLabel: string;
  onPress: () => void;
};

export function AuthBanner({ title, message, buttonLabel, onPress }: AuthBannerProps) {
  const { colors, spacing, typography, theme } = useTheme();

  const handlePress = () => {
    playSound('tap');
    haptic('light');
    onPress();
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.alertSoft,
        padding: spacing.md,
        borderRadius: theme.borderRadius.md,
        borderWidth: 1,
        borderColor: colors.alert + '55',
        marginBottom: spacing.lg,
        gap: spacing.sm,
      }}
      accessibilityLabel={title}
      accessibilityHint={message}
    >
      <LockIcon size={20} color={colors.alert} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, { color: colors.alert, fontWeight: 'bold' }]}>{title}</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 1 }]}>{message}</Text>
      </View>
      <TouchableOpacity
        onPress={handlePress}
        style={{
          backgroundColor: colors.accent,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: theme.borderRadius.sm,
          minHeight: 44,
          justifyContent: 'center',
          alignItems: 'center',
        }}
        accessibilityLabel={buttonLabel}
        accessibilityHint="Navigates to login screen"
        accessibilityRole="button"
      >
        <Text style={[typography.label, { color: colors.onAccent, fontWeight: '900', letterSpacing: 1 }]}>{buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
