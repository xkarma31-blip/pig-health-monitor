import React, { useEffect, useState } from 'react';
import { View, Platform, StyleSheet } from 'react-native';
import { Tabs, TabSlot, TabList, TabTrigger } from 'expo-router/ui';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BottomNav } from '../../components/primitives/BottomNav';
import { SidebarNav, SIDEBAR_WIDTH, SIDEBAR_RAIL_WIDTH } from '../../components/primitives/SidebarNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const SIDEBAR_KEY = 'pigpulse.sidebar.collapsed';

export default function TabLayout() {
  const tier = useBreakpoint();
  const expanded = tier === 'expanded';
  const [collapsed, setCollapsed] = useState(false);

  // Rehydrate the sidebar preference (localStorage on web, AsyncStorage on native).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let raw: string | null = null;
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          raw = localStorage.getItem(SIDEBAR_KEY);
        } else {
          raw = await AsyncStorage.getItem(SIDEBAR_KEY);
        }
        if (alive && raw === '1') setCollapsed(true);
      } catch { /* preference is a nicety, never fatal */ }
    })();
    return () => { alive = false; };
  }, []);

  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
          localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
        } else {
          AsyncStorage.setItem(SIDEBAR_KEY, next ? '1' : '0').catch(() => {});
        }
      } catch { /* ignore storage failures */ }
      return next;
    });
  };

  const railWidth = collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <Tabs>
      {expanded ? (
        <View style={styles.expandedRow}>
          <SidebarNav collapsed={collapsed} onToggle={toggleSidebar} />
          {/* Absolute insets give the slot a definite height in every engine
              (Firefox resolves % heights against flex-grown boxes as auto,
              which used to push the nav below the fold). flexShrink:1 keeps
              the inner ScreenContainer bounded so ScrollViews can scroll. */}
          <View style={[styles.slotArea, { left: railWidth }]}>
            <TabSlot style={styles.slotScroll} />
          </View>
        </View>
      ) : (
        <>
          <View style={styles.slotArea}>
            <TabSlot style={styles.slotScroll} />
          </View>
          <View style={styles.navArea}>
            <BottomNav unreadEvents={0} />
          </View>
        </>
      )}
      {/* Defines the tab routes; the visible bars live above. */}
      <TabList style={styles.hiddenTabList}>
        <TabTrigger name="home" href="/tabs" />
        <TabTrigger name="events" href="/tabs/events" />
        <TabTrigger name="roster" href="/tabs/roster" />
        <TabTrigger name="settings" href="/tabs/settings" />
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  expandedRow: { flex: 1 },
  slotArea: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  // ScreenContainer ships flexShrink:0 (content-sized); allow it to shrink
  // to the definite slot height or ScrollViews grow to content and never scroll.
  slotScroll: { height: '100%', flexShrink: 1 },
  navArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
  },
  hiddenTabList: { display: 'none' },
});