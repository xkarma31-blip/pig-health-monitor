import React, { useState, useEffect } from 'react';
import { Animated, TouchableOpacity, Text, View } from 'react-native';
import { useTheme, statusColor, type Status } from '../../theme';
import { IconChip } from './IconChip';
import { Sparkline } from './Sparkline';
import { ThermometerIcon } from './Icons';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

type ListRowProps = {
  title: string;
  subtitle?: string;
  value?: string;
  status?: Status;
  trend?: number[];
  index?: number;
  onPress?: () => void;
};

export function ListRow({ title, subtitle, value, status = 'neutral', trend, index = 0, onPress }: ListRowProps) {
  const { colors, spacing, typography } = useTheme();
  const { fg, bg } = statusColor(colors, status);

  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(6));
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 45, useNativeDriver: true }).start();
    Animated.timing(translateY, { toValue: 0, duration: 350, delay: index * 45, useNativeDriver: true }).start();
  }, []);

  const pressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 40 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const handlePress = () => {
    playSound('tap');
    haptic('light');
    onPress?.();
  };

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }, { scale }] }}>
      <Wrapper
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 44 }}
        activeOpacity={1}
        {...(onPress ? { onPress: handlePress, onPressIn: pressIn, onPressOut: pressOut } : {})}
        accessibilityLabel={title}
        accessibilityHint={subtitle || value || ''}
        accessibilityRole={onPress ? 'button' : undefined}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, marginRight: 10 }}>
          <IconChip background={bg}>
            <ThermometerIcon size={14} color={fg} />
          </IconChip>
          <View style={{ marginLeft: spacing.md, flexShrink: 1 }}>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>{title}</Text>
            {subtitle ? (
              <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 2, fontSize: 12.5 }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {trend ? <Sparkline trend={trend} color={fg} /> : null}
          {value ? (
            <Text style={[typography.h2, { color: fg, fontSize: 16, fontWeight: '700', marginLeft: trend ? 10 : 0 }]}>
              {value}
            </Text>
          ) : null}
        </View>
      </Wrapper>
    </Animated.View>
  );
}