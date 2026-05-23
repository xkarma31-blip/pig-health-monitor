/**
 * 🏗️ Root Layout — Sovereign Aqua Protocol
 * 
 * Top-level layout with:
 * - Desktop centering (800px max-width with shadow)
 * - Floating Advisor FAB with breathing glow
 * - Global status bar
 */

import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { Theme } from '../constants/Theme';
import AdvisorModal from '../components/AdvisorModal';
import { PulseView } from '../components/Animated/PulseView';
import { playSound } from '../utils/sounds';

export default function RootLayout() {
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const { width } = useWindowDimensions();

  // Desktop threshold
  const isDesktop = width > 768;
  const maxWidth = 800;

  const openAdvisor = () => {
    playSound('toggle');
    setAdvisorVisible(true);
  };

  return (
    <View style={styles.outerBackground}>
      <StatusBar style="light" />
      
      {/* Centered container for Desktop */}
      <View style={[
        styles.appContainer,
        isDesktop && { 
          width: maxWidth, 
          alignSelf: 'center' as const, 
          marginVertical: Theme.spacing.lg, 
          borderRadius: 24, 
          overflow: 'hidden' as const, 
          elevation: 20, 
          shadowColor: '#000', 
          shadowOffset: { width: 0, height: 10 }, 
          shadowOpacity: 0.5, 
          shadowRadius: 30 
        }
      ]}>
        <Slot />
        
        {/* Floating Advisor FAB with breathing pulse */}
        <PulseView duration={3000} minScale={0.95} maxScale={1.05}>
          <TouchableOpacity 
            style={styles.fab} 
            activeOpacity={0.7}
            onPress={openAdvisor}
          >
            <Text style={styles.fabIcon}>💬</Text>
          </TouchableOpacity>
        </PulseView>
      </View>

      <AdvisorModal 
        visible={advisorVisible} 
        onClose={() => {
          playSound('tap');
          setAdvisorVisible(false);
        }} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerBackground: {
    flex: 1,
    backgroundColor: '#05050A',
    justifyContent: 'center',
  },
  appContainer: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    width: '100%',
  },
  fab: {
    position: 'absolute',
    bottom: 95, 
    right: 24,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 2,
    borderColor: Theme.colors.primary,
  },
  fabIcon: {
    fontSize: 32,
  }
});
