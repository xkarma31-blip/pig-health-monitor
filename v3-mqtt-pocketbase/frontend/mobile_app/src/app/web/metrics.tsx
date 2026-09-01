import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme';

export default function MetricsScreen() {
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
      padding: 20,
    },
    screen: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.accent,
      marginBottom: 10,
    },
    subtitle: {
      fontSize: 16,
      color: theme.colors.textSecondary,
      marginBottom: 20,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 20,
      marginBottom: 15,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.accent,
      marginBottom: 10,
    },
    cardValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.textPrimary,
      marginBottom: 5,
    },
    cardStatus: {
      fontSize: 14,
      color: theme.colors.success,
    },
  }), [theme]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView style={styles.content}>
        <View style={styles.screen}>
          <Text style={styles.title}>Health Metrics</Text>
          <Text style={styles.subtitle}>Real-time monitoring dashboard</Text>
          
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Temperature</Text>
            <Text style={styles.cardValue}>38.5°C</Text>
            <Text style={styles.cardStatus}>Normal</Text>
          </View>
          
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Activity Level</Text>
            <Text style={styles.cardValue}>75%</Text>
            <Text style={styles.cardStatus}>Active</Text>
          </View>
          
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cough Detection</Text>
            <Text style={styles.cardValue}>Low</Text>
            <Text style={styles.cardStatus}>Healthy</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
