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

import { Tabs, useRouter, usePathname } from 'expo-router';
import { useWindowDimensions, View, TouchableOpacity, Text } from 'react-native';
import { getAuth, signOut } from 'firebase/auth';
import { Theme } from '../../constants/Theme';
import { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';

export default function TabLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const router = useRouter();
  const pathname = usePathname();

  return (
    <View style={{ flex: 1 }}>
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
            <View style={{ marginRight: 20 }}>
              <TouchableOpacity onPress={() => router.push('/more')} style={{ padding: 8 }}>
                <Text style={{ fontSize: 28, color: Theme.colors.text }}>≡</Text>
              </TouchableOpacity>
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
            href: null,
            headerShown: false,
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

      {/* 🤖 Global Floating Advisor Icon (Hidden when already in Advisor) */}
      {pathname !== '/advisor' && (
        <TouchableOpacity 
          onPress={() => router.push('/advisor')}
          style={{
            position: 'absolute',
            bottom: isDesktop ? 40 : 80,
            right: isDesktop ? 40 : 20,
            backgroundColor: Theme.colors.accent,
            width: 56,
            height: 56,
            borderRadius: 28,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            zIndex: 9999,
          }}
        >
          <Text style={{ fontSize: 30 }}>🤖</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

/**
 * Simple emoji-based tab icon.
 * We use this instead of installing @expo/vector-icons to keep deps minimal.
 */

function TabIcon({ emoji, color }: { emoji: string; color: string }) {
  return <Text style={{ fontSize: 22, opacity: color === Theme.colors.tabActive ? 1 : 0.5 }}>{emoji}</Text>;
}
