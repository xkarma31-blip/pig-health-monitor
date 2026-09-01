import React, { useEffect, useState } from 'react';
import { Animated, Text, TouchableOpacity, View, LayoutChangeEvent } from 'react-native';
import { useTheme } from '../../theme';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

type Option<T extends string> = { key: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (key: T) => void;
};

export function SegmentedControl<T extends string>({ options, value, onChange }: SegmentedControlProps<T>) {
  const { colors, radius, typography } = useTheme();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const [indicatorX] = useState(() => new Animated.Value(0));
  const [indicatorW] = useState(() => new Animated.Value(0));

  const measure = (key: string) => (e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => ({ ...prev, [key]: { x, width } }));
  };

  useEffect(() => {
    const target = layouts[value];
    if (!target) return;
    Animated.parallel([
      Animated.timing(indicatorX, { toValue: target.x, duration: 200, useNativeDriver: false }),
      Animated.timing(indicatorW, { toValue: target.width, duration: 200, useNativeDriver: false }),
    ]).start();
  }, [value, layouts, indicatorX, indicatorW]);

  const select = (key: T) => {
    onChange(key);
    playSound('tap');
    haptic('light');
    const target = layouts[key];
    if (target) {
      Animated.parallel([
        Animated.spring(indicatorX, { toValue: target.x, useNativeDriver: false, speed: 16, bounciness: 8 }),
        Animated.spring(indicatorW, { toValue: target.width, useNativeDriver: false, speed: 16, bounciness: 8 }),
      ]).start();
    }
  };

  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, position: 'relative' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 4,
            bottom: 4,
            left: 0,
            backgroundColor: colors.accentSoft,
            borderRadius: radius.sm,
            transform: [{ translateX: indicatorX }],
            width: indicatorW,
          },
        ]}
      />
      {options.map((opt) => {
        const isActive = opt.key === value;
        return (
          <TouchableOpacity
            key={opt.key}
            style={{ flex: 1, alignItems: 'center', paddingVertical: 9, zIndex: 1, minHeight: 44 }}
            activeOpacity={0.8}
            onLayout={measure(opt.key)}
            onPress={() => select(opt.key)}
            accessibilityLabel={opt.label}
            accessibilityHint={isActive ? 'Currently selected' : `Select ${opt.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[typography.body, { fontWeight: '600', color: isActive ? colors.accent : colors.textSecondary }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}