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

import { Tabs, useRouter } from 'expo-router';
import { useWindowDimensions, View, TouchableOpacity, Text } from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { Theme } from '../../constants/Theme';
import { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const router = useRouter();

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
          display: isDesktop ? 'none' : 'flex',
        },
        tabBarActiveTintColor: Theme.colors.tabActive,
        tabBarInactiveTintColor: Theme.colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        // Screen header styling
        headerShown: !isDesktop,
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
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 20, marginRight: 20, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.push('/sensors')}>
              <Text style={{ fontSize: 22 }}>🌡️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/alerts')}>
              <Text style={{ fontSize: 22 }}>🔔</Text>
            </TouchableOpacity>
            {getAuth().currentUser && (
              <TouchableOpacity onPress={() => signOut(getAuth())}>
                <Text style={{ fontSize: 22 }}>🚪</Text>
              </TouchableOpacity>
            )}
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Monitor',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="📡" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="roster"
        options={{
          title: 'Roster',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🐷" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="advisor"
        options={{
          title: 'Advisor',
          tabBarIcon: ({ color }) => (
            <TabIcon emoji="🤖" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="sensors"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="auth"
        options={{
          href: null,
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
