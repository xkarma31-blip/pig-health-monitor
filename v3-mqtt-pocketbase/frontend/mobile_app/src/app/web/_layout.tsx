import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
} from 'react-native';
import { useRouter, useSegments, Slot } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { DesktopBottomNav } from '../../components/primitives/DesktopBottomNav';
import { useWebTheme, WebThemeProvider } from '../../theme/WebThemeContext';
import { AuthGuard } from '../../components/AuthGuard';

// Inner layout component that uses the theme
function WebLayoutInner() {
  const { loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const { theme } = useWebTheme();

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.textPrimary, textAlign: 'center', marginTop: 100 }}>
          Loading...
        </Text>
      </View>
    );
  }

  const currentRoute = segments[segments.length - 1] || 'dashboard';

  return (
    <AuthGuard>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {Platform.OS !== 'web' && <StatusBar barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'} />}
        <View style={styles.content}>
          <Slot />
        </View>
        <DesktopBottomNav
          active={currentRoute}
          onChange={(next) => router.replace(`/web/${currentRoute === next ? '' : next}`)}
          unreadEvents={0}
        />
      </SafeAreaView>
    </AuthGuard>
  );
}

export default function WebLayout() {
  return (
    <WebThemeProvider initialMode="auto">
      <WebLayoutInner />
    </WebThemeProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 80, // Space for bottom nav
  },
});