import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Slot } from 'expo-router';
import { View, TouchableOpacity, Text, useWindowDimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../theme';
import { WebThemeProvider } from '../theme/WebThemeContext';
import { ToastProvider } from '../components/primitives/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LoadingFallback } from '../components/FallbackComponent';
import { playSound, initSounds } from '../utils/sounds';
import { haptic, initHaptics } from '../utils/haptics';
import AdvisorModal from '../components/AdvisorModal';
import { PulseView } from '../components/Animated/PulseView';

function RootInner({ children }: { children: React.ReactNode }) {
  const [advisorVisible, setAdvisorVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const { colors, spacing, mode } = useTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width > 768;

  useEffect(() => {
    const initializeApp = async () => {
      try {
        await initSounds();
        await initHaptics();
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        setIsLoading(false);
      }
    };

    initializeApp();
  }, []);

  const openAdvisor = () => {
    playSound('toggle');
    haptic('light');
    setAdvisorVisible(true);
  };

  const closeAdvisor = () => {
    playSound('tap');
    haptic('light');
    setAdvisorVisible(false);
  };

  if (isLoading) {
    return (
      <ThemeProvider>
        <LoadingFallback message="Initializing application..." />
      </ThemeProvider>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <View
        style={[
          { flex: 1, width: '100%' },
          isDesktop && {
            width: 800,
            alignSelf: 'center',
            marginVertical: spacing.xxl,
            borderRadius: 24,
            overflow: 'hidden',
            elevation: 12,
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 15,
          },
        ]}
      >
        {children}
      </View>
      <PulseView
        duration={3000}
        minScale={0.95}
        maxScale={1.05}
        style={{
          position: 'absolute',
          bottom: 80,
          right: isDesktop ? Math.max(16, (width - 800) / 2 + 16) : 16,
          zIndex: 999,
        }}
      >
        <TouchableOpacity
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.6,
            shadowRadius: 12,
            elevation: 8,
            borderWidth: 2,
            borderColor: colors.accent,
          }}
          onPress={openAdvisor}
          accessibilityLabel="Open advisor assistant"
          accessibilityHint="Opens the AI advisor chat"
          accessibilityRole="button"
        >
          <Text style={{ fontSize: 24 }}>💬</Text>
        </TouchableOpacity>
      </PulseView>
      <AdvisorModal visible={advisorVisible} onClose={closeAdvisor} />
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <WebThemeProvider>
        <ThemeProvider>
          <ToastProvider>
            <ErrorBoundary
              onError={(error, errorInfo) => {
                console.error('Root layout error:', error, errorInfo);
              }}
            >
              <RootInner>
                <Slot />
              </RootInner>
            </ErrorBoundary>
          </ToastProvider>
        </ThemeProvider>
      </WebThemeProvider>
    </SafeAreaProvider>
  );
}