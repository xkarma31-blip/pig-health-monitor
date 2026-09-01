import React, { useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { useTheme } from '../../theme';

export default function WebLayout() {
  const router = useRouter();
  const { theme } = useTheme();

  const styles = useMemo(() => StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      flex: 1,
      padding: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: theme.colors.accent,
      marginBottom: 10,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 18,
      color: theme.colors.textSecondary,
      marginBottom: 40,
      textAlign: 'center',
    },
    navigation: {
      flexDirection: 'column',
      gap: 15,
      marginBottom: 40,
    },
    navButton: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 15,
      alignItems: 'center',
      width: 200,
    },
    navButtonText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.accent,
    },
    info: {
      alignItems: 'center',
    },
    infoText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginBottom: 10,
    },
  }), [theme]);

  const navigateTo = (path: string) => {
    router.push(path);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <Text style={styles.title}>Pig Health Monitor</Text>
        <Text style={styles.subtitle}>Web Interface</Text>
        
        <View style={styles.navigation}>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateTo('/web/dashboard')}>
            <Text style={styles.navButtonText}>Dashboard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateTo('/web/metrics')}>
            <Text style={styles.navButtonText}>Metrics</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateTo('/web/research')}>
            <Text style={styles.navButtonText}>Research</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.navButton} onPress={() => navigateTo('/web/sitemap')}>
            <Text style={styles.navButtonText}>Sitemap</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.info}>
          <Text style={styles.infoText}>
            This is the web interface for the Pig Health Monitor system.
          </Text>
          <Text style={styles.infoText}>
            Navigate using the buttons above or visit specific pages directly.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
