/**
 * 🏗️ Root Layout
 * 
 * This is the TOP-LEVEL layout for the entire app.
 * It wraps everything in a safe background color and status bar.
 * 
 * The actual navigation (tabs) is handled by app/(tabs)/_layout.tsx.
 * Expo Router automatically discovers the (tabs) folder and uses it.
 */

import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { Theme } from '../constants/Theme';

export default function RootLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: Theme.colors.background }}>
      <StatusBar style="light" />
      <Slot />
    </View>
  );
}
