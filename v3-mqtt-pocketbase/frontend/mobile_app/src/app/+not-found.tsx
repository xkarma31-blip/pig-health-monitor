import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme } from '../theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Page Not Found', headerShown: false }} />
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={styles.emoji} accessibilityLabel="Lost pig emoji">🐷❓</Text>
        <Text
          style={[styles.title, { color: colors.accent }]}
          accessibilityRole="header"
        >
          Oink! Wrong Pen!
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          This page doesn't exist in the barn.
        </Text>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.accent }]}
          onPress={() => router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="Go back to home"
          accessibilityHint="Navigates to the main dashboard"
        >
          <Text style={[styles.buttonText, { color: colors.onAccent }]}>
            🏠 Back to Dashboard
          </Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    minWidth: 200,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});