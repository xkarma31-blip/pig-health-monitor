/**
 * 📱 Tab Navigator Layout
 * 
 * This creates the bottom tab bar with 3 screens.
 * Expo Router uses FILE-BASED routing — each file in (tabs)/ = one tab.
 * 
 * TO ADD A NEW TAB:
 *   1. Create a new file in app/(tabs)/ (e.g., settings.tsx)
 *   2. Add a new <Tabs.Screen> entry below
 *   3. That's it! The tab appears automatically.
 */

import { Tabs } from 'expo-router';
import { Theme } from '../../constants/Theme';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        // Tab bar styling
        tabBarStyle: {
          backgroundColor: Theme.colors.tabBar,
          borderTopColor: Theme.colors.cardBorder,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: Theme.colors.tabActive,
        tabBarInactiveTintColor: Theme.colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        // Screen header styling
        headerStyle: {
          backgroundColor: Theme.colors.background,
        },
        headerTintColor: Theme.colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: Theme.typography.h2,
        },
        sceneStyle: {
          backgroundColor: Theme.colors.background,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            // Using emoji as icon — no extra dependencies needed!
            <TabIcon emoji="📊" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="sensors"
        options={{
          title: 'Sensors',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🌡️" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🔔" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

/**
 * Simple emoji-based tab icon.
 * We use this instead of installing @expo/vector-icons to keep deps minimal.
 */
import { Text } from 'react-native';

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 22, opacity: color === Theme.colors.tabActive ? 1 : 0.5 }}>{emoji}</Text>;
}
