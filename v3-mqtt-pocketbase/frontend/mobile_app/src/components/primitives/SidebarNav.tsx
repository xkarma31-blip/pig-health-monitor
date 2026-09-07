import React, { useState } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTabTrigger } from 'expo-router/ui';
import { useTheme } from '../../theme';
import { LogoMark } from './LogoMark';
import { HomeIcon, BellIcon, RosterIcon, SettingsIcon } from './Icons';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';
import type { TabKey } from './BottomNav';

type SidebarItemProps = {
  name: TabKey;
  label: string;
  icon: (color: string) => React.ReactNode;
  badge?: number;
};

function SidebarItem({ name, label, icon, badge }: SidebarItemProps) {
  const { colors, radius, typography, spacing } = useTheme();
  const [scale] = useState(() => new Animated.Value(1));
  const { triggerProps } = useTabTrigger({
    name,
    onPress: () => {
      haptic('light');
      playSound('tap');
    },
  });

  const active = triggerProps.isFocused;
  const color = active ? colors.accent : colors.textSecondary;
  const handlePress = triggerProps.onPress ?? undefined;

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handlePress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
      style={[
        styles.item,
        {
          borderRadius: radius.md,
          backgroundColor: active ? colors.accentSoft : 'transparent',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.xs,
        },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View style={{ transform: [{ scale }], flexDirection: 'row', alignItems: 'center' }}>
        <View style={styles.iconSlot}>
          {icon(color)}
          {badge && badge > 0 && name === 'events' ? (
            <View style={[styles.badge, { backgroundColor: colors.alert }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        <Text
          style={[
            typography.h2,
            { color, fontSize: 14, marginLeft: spacing.md, fontWeight: active ? '700' : '600' },
          ]}
        >
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export function SidebarNav({ unreadEvents = 0 }: { unreadEvents?: number }) {
  const { colors, spacing } = useTheme();

  return (
    <View
      style={[
        styles.rail,
        {
          backgroundColor: colors.surface,
          borderRightColor: colors.divider,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.xl,
          paddingBottom: spacing.lg,
        },
      ]}
    >
      <View style={[styles.brand, { paddingHorizontal: spacing.sm, marginBottom: spacing.xl }]}>
        <LogoMark />
        <Text style={[typoH1, { marginLeft: 9 }]}>
          <Text style={{ color: colors.textPrimary }}>Pig</Text>
          <Text style={{ color: colors.accent }}>pulse</Text>
        </Text>
      </View>

      <SidebarItem name="home" label="Home" icon={(c) => <HomeIcon color={c} />} />
      <SidebarItem name="events" label="Events" icon={(c) => <BellIcon color={c} />} badge={unreadEvents} />
      <SidebarItem name="roster" label="Roster" icon={(c) => <RosterIcon color={c} />} />
      <SidebarItem name="settings" label="Settings" icon={(c) => <SettingsIcon color={c} />} />

      <View style={{ flex: 1 }} />
      <Text style={[styles.version, { color: colors.textMuted, paddingHorizontal: spacing.sm }]}>
        Pigpulse · v2.1.0
      </Text>
    </View>
  );
}

const typoH1 = { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 };

const styles = StyleSheet.create({
  rail: {
    width: 232,
    borderTopWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  item: { minHeight: 44, justifyContent: 'center' },
  iconSlot: { width: 26, alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: 'white', fontSize: 9.5, fontWeight: '700' },
  version: { fontSize: 12 },
});
