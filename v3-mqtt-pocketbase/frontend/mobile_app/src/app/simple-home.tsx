import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme';

export default function HomeScreen() {
  const { theme } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.accent }]}>🐷 Pig Health Monitor</Text>
      <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
        Redesign in progress — core fixes applied
      </Text>
      
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.success }]}>✅ Authentication Fixed</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          Web authentication working with browserLocalPersistence
        </Text>
      </View>
      
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.success }]}>✅ AI Integration Complete</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          Edge Impulse ML integration with real-time monitoring
        </Text>
      </View>
      
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.success }]}>✅ Navigation Enhanced</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          AI tab added to bottom navigation system
        </Text>
      </View>
      
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.success }]}>✅ Web Routes Fixed</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          All web routes working with proper error handling
        </Text>
      </View>
      
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>ℹ️ About PigPulse</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          Real-time swine-health monitoring: ESP32 sensors (temp, humidity, CO₂) feed
          Firebase via Edge Impulse AI. Mobile (Expo) + web dashboards with a deep-space
          navy + Lucky Cyan/Teal palette.
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.textPrimary }]}>🧪 Test surfaces</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          Web (test): <Text style={{ color: theme.colors.accent }}>http://localhost:8082</Text>
          {'\n'}Android (test): scrcpy mirrors the pigpulse-avd emulator
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text style={[styles.cardTitle, { color: theme.colors.warning }]}>⚠️ Android emulator note</Text>
        <Text style={[styles.cardText, { color: theme.colors.textSecondary }]}>
          Emulator graphics are laggy. For reliable on-device validation, install the
          preview APK on a physical device (per AGENTS.md).
        </Text>
      </View>

      <View style={[styles.status, { backgroundColor: theme.colors.success }]}>
        <Text style={[styles.statusText, { color: theme.colors.background }]}>
          🎯 STATUS: REDESIGN IN PROGRESS — CORE FIXES APPLIED
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    marginBottom: 30,
    textAlign: 'center',
  },
  card: {
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    width: '100%',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    textAlign: 'center',
  },
  status: {
    borderRadius: 10,
    padding: 15,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
