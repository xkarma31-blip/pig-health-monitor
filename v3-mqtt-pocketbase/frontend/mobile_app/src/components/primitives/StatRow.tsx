import React, { useState, useEffect } from 'react';
import { Animated, TouchableOpacity, Text, View } from 'react-native';
import { useTheme, statusColor } from '../../theme';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

function CountUpValue({ target, color }: { target: number; color: string }) {
  const { typography } = useTheme();
  const [display, setDisplay] = useState(0);
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const id = anim.addListener(({ value }) => setDisplay(Math.round(value)));
    Animated.timing(anim, {
      toValue: target,
      duration: 500,
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [target]);

  return <Text style={[typography.stat, { color, marginTop: 2 }]}>{display}</Text>;
}

function StatCell({ label, value, status }: { label: string; value: number; status: 'healthy' | 'watch' | 'alert' }) {
  const { colors, spacing, radius, typography } = useTheme();
  const { fg } = statusColor(colors, status);
  const [scale] = useState(() => new Animated.Value(1));

  const handlePress = () => {
    playSound('tap');
    haptic('light');
  };

  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={() => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 40 }).start()}
        onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
        onPress={handlePress}
        style={{ backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, minHeight: 44 }}
        accessibilityLabel={`${label}: ${value}`}
        accessibilityHint={`Status: ${status}`}
        accessibilityRole="button"
      >
        <Text style={[typography.label, { color: colors.textSecondary }]}>{label}</Text>
        <CountUpValue target={value} color={fg} />
      </TouchableOpacity>
    </Animated.View>
  );
}

type StatRowProps = {
  healthy: number;
  watch: number;
  alert: number;
};

export function StatRow({ healthy, watch, alert }: StatRowProps) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', marginTop: spacing.xl, gap: spacing.sm }}>
      <StatCell label="Healthy" value={healthy} status="healthy" />
      <StatCell label="Watch" value={watch} status="watch" />
      <StatCell label="Alert" value={alert} status="alert" />
    </View>
  );
}