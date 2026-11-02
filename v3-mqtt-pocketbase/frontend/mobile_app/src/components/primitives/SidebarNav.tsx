import React, { useEffect, useState } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { useTabTrigger } from 'expo-router/ui';
import { useTheme } from '../../theme';
import { LogoMark } from './LogoMark';
import {
  HomeIcon,
  BellIcon,
  RosterIcon,
  SettingsIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from './Icons';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';
import type { TabKey } from './BottomNav';

// Single source of truth for rail widths (layout offsets slot content).
export const SIDEBAR_WIDTH = 232;
export const SIDEBAR_RAIL_WIDTH = 68;

type SidebarItemProps = {
  name: TabKey;
  label: string;
  icon: (color: string) => React.ReactNode;
  badge?: number;
  collapsed?: boolean;
};

function SidebarItem({ name, label, icon, badge, collapsed }: SidebarItemProps) {
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
          paddingHorizontal: collapsed ? 0 : spacing.md,
          paddingVertical: spacing.sm + 2,
          marginBottom: spacing.xs,
        },
      ]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <View style={styles.iconSlot}>
          {icon(color)}
          {badge && badge > 0 && name === 'events' ? (
            <View style={[styles.badge, { backgroundColor: colors.alert }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
        {!collapsed ? (
          <Text
            style={[
              typography.h2,
              { color, fontSize: 14, marginLeft: spacing.md, fontWeight: active ? '700' : '600' },
            ]}
          >
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </TouchableOpacity>
  );
}

type SidebarNavProps = {
  collapsed: boolean;
  onToggle: () => void;
  unreadEvents?: number;
};

export function SidebarNav({ collapsed, onToggle, unreadEvents = 0 }: SidebarNavProps) {
  const { colors, spacing, radius } = useTheme();
  const [anim] = useState(() => new Animated.Value(collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH,
      duration: 180,
      useNativeDriver: false, // width isn't transform/opacity — JS driver (works web + native)
    }).start();
  }, [collapsed, anim]);

  return (
    <Animated.View
      style={[
        styles.rail,
        {
          width: anim,
          backgroundColor: colors.surface,
          borderRightColor: colors.divider,
          paddingHorizontal: spacing.md,
          paddingTop: spacing.xl,
          paddingBottom: spacing.lg,
        },
      ]}
    >
      <View
        style={[
          styles.brand,
          { paddingHorizontal: spacing.sm, marginBottom: spacing.md, justifyContent: collapsed ? 'center' : 'flex-start' },
        ]}
      >
        <LogoMark />
        {!collapsed ? (
          <Text style={[typoH1, { marginLeft: 9 }]}>
            <Text style={{ color: colors.textPrimary }}>Pig</Text>
            <Text style={{ color: colors.accent }}>pulse</Text>
          </Text>
        ) : null}
      </View>

      {/* Collapse / expand toggle (44×44 min touch target) */}
      <View style={[styles.toggleRow, { marginBottom: spacing.xs }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            haptic('light');
            playSound('toggle');
            onToggle();
          }}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={[
            styles.toggleBtn,
            { borderRadius: radius.md, alignItems: collapsed ? 'center' : 'flex-start' },
          ]}
        >
          {collapsed ? (
            <ChevronRightIcon color={colors.textSecondary} />
          ) : (
            <ChevronLeftIcon color={colors.textSecondary} />
          )}
        </TouchableOpacity>
      </View>

      <SidebarItem name="home" label="Home" icon={(c) => <HomeIcon color={c} />} collapsed={collapsed} />
      <SidebarItem name="events" label="Events" icon={(c) => <BellIcon color={c} />} badge={unreadEvents} collapsed={collapsed} />
      <SidebarItem name="roster" label="Roster" icon={(c) => <RosterIcon color={c} />} collapsed={collapsed} />
      <SidebarItem name="settings" label="Settings" icon={(c) => <SettingsIcon color={c} />} collapsed={collapsed} />

      <View style={{ flex: 1 }} />
      {!collapsed ? (
        <Text style={[styles.version, { color: colors.textMuted, paddingHorizontal: spacing.sm }]}>
          Pigpulse · v2.1.0
        </Text>
      ) : null}
    </Animated.View>
  );
}

const typoH1 = { fontSize: 22, fontWeight: '800' as const, letterSpacing: -0.5 };

const styles = StyleSheet.create({
  rail: {
    borderTopWidth: 0,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: { flexDirection: 'row', alignItems: 'center' },
  toggleRow: { flexDirection: 'row' },
  toggleBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    paddingLeft: 12,
  },
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