/**
 * 🏗️ Root Layout
 * 
 * This is the TOP-LEVEL layout for the entire app.
 * It wraps everything in a safe background color and status bar.
 * 
 * The actual navigation (tabs) is handled by app/(tabs)/_layout.tsx.
 * Expo Router automatically discovers the (tabs) folder and uses it.
 */

import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { Theme } from '../constants/Theme';
import { registerForPushNotificationsAsync } from '../utils/notifications';

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    registerForPushNotificationsAsync().catch(console.error);

    const subscriber = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (initializing) setInitializing(false);
    });
    return subscriber; // unsubscribe on unmount
  }, []);

  useEffect(() => {
    if (initializing) return;

    const inAuthGroup = segments[0] === '(auth)';

    // GUEST-FIRST PROTOCOL: 
    // We no longer force users to /login immediately.
    // They can enter (tabs) as guests.
    // We only redirect away from auth group if they are logged in.
    if (user && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [user, initializing, segments]);

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: Theme.colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: Theme.colors.background }}>
      <StatusBar style="light" />
      <Slot />
    </View>
  );
}
