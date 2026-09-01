/**
 * 📱 Tab Navigator Layout — Sovereign Aqua Protocol
 * 
 * 4-tab bottom navigation with sound feedback on tab switch.
 * Expo Router file-based routing: each file in (tabs)/ = one tab.
 */

import { Tabs, router } from 'expo-router';
import { Theme } from '../../constants/Theme';
import { View, Text, TouchableOpacity, Alert, Platform } from 'react-native';
import { useAuth, setAuthUser } from '../../utils/auth';
import { playSound } from '../../utils/sounds';

export default function TabLayout() {
  const user = useAuth();

  const handleAuthAction = () => {
    if (user) {
      const performLogout = () => {
        playSound('warning');
        setAuthUser(null);
        if (Platform.OS === 'web') {
          alert('Disconnected. You are now browsing as a Guest.');
        } else {
          Alert.alert('Disconnected', 'You are now browsing as a Guest.');
        }
      };

      if (Platform.OS === 'web') {
        if (window.confirm('Log Out\n\nAre you sure you want to disconnect from the Cloud?')) {
          performLogout();
        }
      } else {
        Alert.alert('Log Out', 'Are you sure you want to disconnect from the Cloud?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', style: 'destructive', onPress: performLogout }
        ]);
      }
    } else {
      playSound('navigate');
      router.push('/login');
    }
  };

  return (
    <Tabs
      screenListeners={{
        tabPress: () => playSound('tap'),
      }}
      screenOptions={{
        tabBarShowLabel: false,
        tabBarStyle: {
          backgroundColor: Theme.colors.tabBar,
          borderTopColor: Theme.colors.cardBorder,
          borderTopWidth: 1.5,
          height: Platform.OS === 'ios' ? 88 : 74,
          paddingBottom: Platform.OS === 'ios' ? 24 : 12,
          paddingTop: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 10,
        },
        tabBarActiveTintColor: Theme.colors.tabActive,
        tabBarInactiveTintColor: Theme.colors.tabInactive,
        headerStyle: {
          backgroundColor: Theme.colors.background,
          borderBottomWidth: 1,
          borderBottomColor: Theme.colors.cardBorder,
        },
        headerTintColor: Theme.colors.text,
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: Theme.typography.h2,
          letterSpacing: 1,
        },
        sceneStyle: {
          backgroundColor: Theme.colors.background,
        },
        headerRight: () => (
          <TouchableOpacity 
            style={{ 
              marginRight: 16, 
              padding: 8, 
              paddingHorizontal: 14,
              backgroundColor: user ? Theme.colors.danger + '22' : Theme.colors.primary + '22', 
              borderRadius: Theme.borderRadius.sm, 
              borderWidth: 1.5, 
              borderColor: user ? Theme.colors.danger : Theme.colors.primary 
            }}
            onPress={handleAuthAction}
          >
            <Text style={{ 
              color: user ? Theme.colors.danger : Theme.colors.primary, 
              fontWeight: '900', 
              fontSize: 11,
              letterSpacing: 1.5,
            }}>
              {user ? '⏻ LOGOUT' : '⏻ LOGIN'}
            </Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📊" label="Home" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="events"
        options={{
          title: 'Events',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="🔔" label="Events" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📈" label="Metrics" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="nodes"
        options={{
          title: 'Nodes',
          tabBarIcon: ({ focused }) => (
            <TabIcon emoji="📡" label="Nodes" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

interface TabIconProps {
  emoji: string;
  label: string;
  focused: boolean;
}

function TabIcon({ emoji, label, focused }: TabIconProps) {
  if (focused) {
    return (
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Theme.colors.primary + '18', // ~10% opacity cyan
        borderWidth: 1.5,
        borderColor: Theme.colors.primary,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 6,
        shadowColor: Theme.colors.primary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
        elevation: 4,
      }}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
        <Text style={{
          color: Theme.colors.primary,
          fontWeight: '900',
          fontSize: 11,
          marginLeft: 6,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
      width: 44,
      height: 44,
    }}>
      <Text style={{ fontSize: 22, opacity: 0.55 }}>{emoji}</Text>
    </View>
  );
}
