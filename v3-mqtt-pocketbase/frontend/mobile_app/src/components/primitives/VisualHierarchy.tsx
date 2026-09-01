/**
 * Visual Hierarchy and Accessibility Improvements
 * Comprehensive improvements for better visual hierarchy, contrast, and non-color indicators
 */

import React from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { useTheme } from '../../theme';

// Screen dimensions for responsive design
const { width: screenWidth } = Dimensions.get('window');

// Visual hierarchy constants
export const VISUAL_HIERARCHY = {
  // Font sizes with clear hierarchy
  HEADLINE: {
    size: 28,
    weight: '700',
    lineHeight: 34,
    marginBottom: 16,
  },
  TITLE: {
    size: 22,
    weight: '600',
    lineHeight: 28,
    marginBottom: 12,
  },
  SUBTITLE: {
    size: 18,
    weight: '500',
    lineHeight: 24,
    marginBottom: 8,
  },
  BODY: {
    size: 16,
    weight: '400',
    lineHeight: 24,
    marginBottom: 4,
  },
  CAPTION: {
    size: 14,
    weight: '400',
    lineHeight: 20,
    marginBottom: 2,
  },
  LABEL: {
    size: 12,
    weight: '500',
    lineHeight: 16,
    marginBottom: 0,
  },
};

// Spacing system for visual rhythm
export const VISUAL_SPACING = {
  // Consistent spacing for visual rhythm
  MICRO: 4,
  SMALL: 8,
  MEDIUM: 16,
  LARGE: 24,
  XLARGE: 32,
  XXLARGE: 48,
};

// Non-color status indicators for accessibility
export const STATUS_INDICATORS = {
  // Shape-based indicators for colorblind users
  NORMAL: {
    shape: 'circle', // Circle
    icon: '✓',
    pattern: 'solid',
    borderWidth: 2,
  },
  ELEVATED: {
    shape: 'square', // Square
    icon: '⚠',
    pattern: 'dashed',
    borderWidth: 2,
  },
  HIGH: {
    shape: 'triangle', // Triangle
    icon: '✗',
    pattern: 'dotted',
    borderWidth: 3,
  },
  CRITICAL: {
    shape: 'diamond', // Diamond
    icon: '🚨',
    pattern: 'double',
    borderWidth: 4,
  },
};

// Visual hierarchy component
export function VisualHierarchy({
  children,
  type = 'BODY',
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  type?: keyof typeof VISUAL_HIERARCHY;
  style?: any;
  accessibilityLabel?: string;
}) {
  const hierarchy = VISUAL_HIERARCHY[type];
  
  return (
    <Text
      style={[
        {
          fontSize: hierarchy.size,
          fontWeight: hierarchy.weight,
          lineHeight: hierarchy.lineHeight,
          marginBottom: hierarchy.marginBottom,
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="text"
    >
      {children}
    </Text>
  );
}

// Non-color status indicator component
export function StatusIndicator({
  status,
  size = 24,
  showIcon = true,
  accessibilityLabel,
}: {
  status: keyof typeof STATUS_INDICATORS;
  size?: number;
  showIcon?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const indicator = STATUS_INDICATORS[String(status).toUpperCase() as keyof typeof STATUS_INDICATORS] || STATUS_INDICATORS.NORMAL;
  
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: indicator.shape === 'circle' ? size / 2 : 2,
        borderWidth: indicator.borderWidth,
        borderStyle: indicator.pattern as 'solid' | 'dotted' | 'dashed',
        backgroundColor: 'transparent',
      }}
      accessibilityLabel={accessibilityLabel || `Status: ${status}`}
      accessibilityRole="image"
    >
      {showIcon && (
        <Text
          style={{
            fontSize: size * 0.6,
            textAlign: 'center',
            lineHeight: size,
            color: colors.textPrimary,
          }}
          accessibilityLabel={indicator.icon}
        >
          {indicator.icon}
        </Text>
      )}
    </View>
  );
}

// Enhanced card component with proper contrast
export function EnhancedCard({
  children,
  variant = 'normal',
  style,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  variant?: 'normal' | 'elevated' | 'high' | 'critical';
  style?: any;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  
  const getCardStyle = () => {
    switch (variant) {
      case 'elevated':
        return {
          elevation: 4,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
        };
      case 'high':
        return {
          elevation: 6,
          shadowColor: colors.error,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 8,
        };
      case 'critical':
        return {
          elevation: 8,
          shadowColor: colors.error,
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: colors.error,
        };
      default:
        return {
          elevation: 2,
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 2,
        };
    }
  };

  return (
    <View
      style={[
        {
          padding: VISUAL_SPACING.MEDIUM,
          borderRadius: 8,
          marginVertical: VISUAL_SPACING.SMALL,
          backgroundColor: colors.surface,
          ...getCardStyle(),
        },
        style,
      ]}
      accessibilityLabel={accessibilityLabel || `Card: ${variant}`}
      accessibilityRole="none"
    >
      {children}
    </View>
  );
}

// Accessible button with proper contrast and feedback
export function AccessibleButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();

  const getButtonStyle = () => {
    if (disabled) {
      return {
        backgroundColor: colors.textDisabled,
        opacity: 0.6,
      };
    }

    switch (variant) {
      case 'secondary':
        return {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.divider,
        };
      case 'danger':
        return {
          backgroundColor: colors.error,
        };
      case 'success':
        return {
          backgroundColor: colors.success,
        };
      default:
        return {
          backgroundColor: colors.primary,
        };
    }
  };

  const getTextStyle = () => {
    if (disabled) {
      return {
        color: colors.textMuted,
      };
    }

    switch (variant) {
      case 'secondary':
        return {
          color: colors.textPrimary,
        };
      case 'danger':
        return {
          color: colors.white,
        };
      case 'success':
        return {
          color: colors.white,
        };
      default:
        return {
          color: colors.white,
        };
    }
  };

  return (
    <TouchableOpacity
      style={[
        {
          paddingVertical: VISUAL_SPACING.MEDIUM,
          paddingHorizontal: VISUAL_SPACING.LARGE,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 48, // Minimum touch target size
          ...getButtonStyle(),
        },
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel || 'Button'}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <Text style={[getTextStyle(), { fontSize: VISUAL_HIERARCHY.BODY.size }]}>
        {children}
      </Text>
    </TouchableOpacity>
  );
}

// Responsive grid layout
export function ResponsiveGrid({
  children,
  columns = 2,
  spacing = VISUAL_SPACING.MEDIUM,
}: {
  children: React.ReactNode;
  columns?: number;
  spacing?: number;
}) {
  const itemWidth = (screenWidth - spacing * (columns + 1)) / columns;
  
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -spacing }}>
      {React.Children.map(children, (child, index) => (
        <View
          key={index}
          style={{
            width: itemWidth,
            margin: spacing,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
}

// Progress indicator with non-color feedback
export function ProgressIndicator({
  progress,
  max = 100,
  showPercentage = true,
  accessibilityLabel,
}: {
  progress: number;
  max?: number;
  showPercentage?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const percentage = Math.round((progress / max) * 100);
  
  return (
    <View
      style={{ marginBottom: VISUAL_SPACING.SMALL }}
      accessibilityLabel={accessibilityLabel || `Progress: ${percentage}%`}
    >
      <VisualHierarchy type="CAPTION" accessibilityLabel="Progress percentage">
        {showPercentage && `${percentage}%`}
      </VisualHierarchy>
      <View
        style={{
          height: 8,
          backgroundColor: colors.border,
          borderRadius: 4,
          overflow: 'hidden',
        }}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max, now: progress }}
      >
        <View
          style={{
            height: '100%',
            width: `${percentage}%`,
            backgroundColor: percentage > 80 ? colors.error : percentage > 50 ? colors.warning : colors.success,
          }}
        />
      </View>
    </View>
  );
}
