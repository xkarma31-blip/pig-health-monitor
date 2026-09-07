import React, { useState, useEffect } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTabTrigger } from 'expo-router/ui';
import { useTheme } from '../../theme';
import { HomeIcon, BellIcon, RosterIcon, SettingsIcon } from './Icons';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

export type TabKey = 'home' | 'events' | 'roster' | 'settings';

type NavButtonProps = {
  name: TabKey;
  label: string;
  icon: (color: string) => React.ReactNode;
  badge?: number;
};

function NavButton({ name, label, icon, badge }: NavButtonProps) {
  const { colors, radius, typography } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const [chipScale] = useState(() => new Animated.Value(0.8));
  const { triggerProps } = useTabTrigger({
    name,
    onPress: () => {
      haptic('light');
      playSound('tap');
    },
  });

  const active = triggerProps.isFocused;
  const handlePress = triggerProps.onPress ?? undefined;

  useEffect(() => {
    Animated.spring(chipScale, {
      toValue: active ? 1 : 0.8,
      useNativeDriver: true,
      speed: 20,
      bounciness: active ? 10 : 0,
    }).start();
  }, [active, chipScale]);

  const color = active ? colors.accent : colors.textMuted;
  const showBadge = name !== 'events' || !active ? (badge ?? 0) > 0 : false;

  return (
    <TouchableOpacity
      style={styles.tab}
      activeOpacity={1}
      onPress={handlePress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.86, useNativeDriver: true, speed: 40 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <Animated.View
          style={[
            styles.iconWrap,
            {
              borderRadius: radius.sm,
              backgroundColor: active ? colors.accentSoft : 'transparent',
              transform: [{ scale: chipScale }],
            },
          ]}
        >
          {icon(color)}
          {showBadge ? (
            <View style={[styles.badge, { backgroundColor: colors.alert }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </Animated.View>
      </Animated.View>
      <Text style={[typography.label, { color, fontSize: 10.5, marginTop: 2 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

type BottomNavProps = {
  unreadEvents?: number;
};

export function BottomNav({ unreadEvents = 0 }: BottomNavProps) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        { backgroundColor: colors.surface, borderTopColor: colors.divider, paddingTop: spacing.sm },
      ]}
    >
      <NavButton name="home" label="Home" icon={(c) => <HomeIcon color={c} />} />
      <NavButton name="events" label="Events" icon={(c) => <BellIcon color={c} />} badge={unreadEvents} />
      <NavButton name="roster" label="Roster" icon={(c) => <RosterIcon color={c} />} />
      <NavButton name="settings" label="Settings" icon={(c) => <SettingsIcon color={c} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingBottom: 22 },
  tab: { flex: 1, alignItems: 'center' },
  iconWrap: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -2,
    right: 1,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: 'white', fontSize: 9.5, fontWeight: '700' },
});
