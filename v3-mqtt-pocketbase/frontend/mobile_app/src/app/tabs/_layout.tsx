import React, { useState } from 'react';
import { Animated } from 'react-native';
import { Tabs, TabSlot, TabList, TabTrigger } from 'expo-router/ui';
import { router } from 'expo-router';
import { BottomNav, type TabKey } from '../../components/primitives/BottomNav';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

const TAB_PATHS: Record<TabKey, string> = {
  home: '/tabs',
  events: '/tabs/events',
  roster: '/tabs/roster',
  settings: '/tabs/settings',
};

export default function TabLayout() {
  const [fade] = useState(() => new Animated.Value(1));
  const [activeTab, setActiveTab] = useState<TabKey>('home');
  const [unreadEvents, setUnreadEvents] = useState(0);

  const changeTab = (tab: TabKey) => {
    if (tab === activeTab) return;
    haptic('light');
    playSound('tap');
    Animated.timing(fade, { toValue: 0, duration: 120, useNativeDriver: true }).start(() => {
      const path = TAB_PATHS[tab];
      if (path) {
        router.replace(path);
        setActiveTab(tab);
        if (tab === 'events') setUnreadEvents(0);
      }
      fade.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    });
  };

  return (
    <Tabs>
      <Animated.View style={{ flex: 1, opacity: fade }}>
        <TabSlot />
      </Animated.View>
      <TabList style={{ position: 'absolute', left: -9999, top: -9999 }}>
        <TabTrigger name="home" href="/tabs" />
        <TabTrigger name="events" href="/tabs/events" />
        <TabTrigger name="roster" href="/tabs/roster" />
        <TabTrigger name="settings" href="/tabs/settings" />
      </TabList>
      <BottomNav active={activeTab} onChange={changeTab} unreadEvents={unreadEvents} />
    </Tabs>
  );
}