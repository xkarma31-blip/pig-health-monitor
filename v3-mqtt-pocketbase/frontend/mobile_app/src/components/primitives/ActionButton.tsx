import React, { ReactNode } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

type ActionButtonVariant = 'primary' | 'secondary' | 'warning' | 'danger';

type ActionButtonProps = {
  children: ReactNode; // Changed from label
  onPress: () => void;
  variant?: ActionButtonVariant;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  disabled?: boolean;
};

export function ActionButton({
  children, // Changed from label
  onPress,
  variant = 'primary',
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
}: ActionButtonProps) {
  const { colors, spacing, typography, radius } = useTheme();

  const getBackgroundColor = (): string => {
    switch (variant) {
      case 'primary':
        return colors.primary;
      case 'secondary':
        return colors.secondary;
      case 'warning':
        return colors.warning;
      case 'danger':
        return colors.error;
      default:
        return colors.primary;
    }
  };

  const getTextColor = (): string => {
    if (variant === 'primary') {
      return (colors as unknown as Record<string, string>).onPrimary ?? colors.textPrimary;
    }
    return colors.textPrimary;
  };

  return (
    <TouchableOpacity
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderRadius: radius.md,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 44,
          minWidth: 44,
        },
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (typeof children === 'string' ? children : 'Action button')} // Updated accessibilityLabel
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
    >
      {typeof children === 'string' ? (
        <Text
          style={[
            typography.body,
            {
              color: getTextColor(),
              fontWeight: '600',
            },
          ]}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row', // Added to allow icon + text
    gap: 8, // Added for spacing between icon and text
  },
  disabled: {
    opacity: 0.5,
  },
});
