import React from 'react';
import { View } from 'react-native';
import { Tabs, TabSlot, TabList, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';
import { BottomNav } from '../../components/primitives/BottomNav';
import { SidebarNav } from '../../components/primitives/SidebarNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// Keep in sync with SidebarNav rail width.
const SIDEBAR_WIDTH = 232;

export default function TabLayout() {
  const tier = useBreakpoint();
  const expanded = tier === 'expanded';

  return (
    <Tabs>
      {expanded ? (
        <View style={styles.expandedRow}>
          <SidebarNav />
          {/* Absolute insets give the slot a definite height in every engine
              (Firefox resolves % heights against flex-grown boxes as auto,
              which used to push the nav below the fold). flexShrink:1 keeps
              the inner ScreenContainer bounded so ScrollViews can scroll. */}
          <View style={[styles.slotArea, { left: SIDEBAR_WIDTH }]}>
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
