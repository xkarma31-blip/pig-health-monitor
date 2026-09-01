import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../theme';

export default function SitemapScreen() {
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
    linkCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 20,
      marginBottom: 15,
    },
    linkTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.accent,
      marginBottom: 5,
    },
    linkUrl: {
      fontSize: 14,
      color: theme.colors.textPrimary,
      marginBottom: 10,
    },
    linkButton: {
      backgroundColor: theme.colors.accent,
      borderRadius: 5,
      padding: 10,
      alignItems: 'center',
    },
    linkButtonText: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.background,
    },
  }), [theme]);

  const links = [
    { title: 'Home', url: 'https://pig-health-monitor.vercel.app/' },
    { title: 'Login', url: 'https://pig-health-monitor.vercel.app/login' },
    { title: 'Metrics', url: 'https://pig-health-monitor.vercel.app/metrics' },
    { title: 'Events', url: 'https://pig-health-monitor.vercel.app/events' },
    { title: 'Analytics', url: 'https://pig-health-monitor.vercel.app/analytics' },
    { title: 'Settings', url: 'https://pig-health-monitor.vercel.app/settings' },
  ];

  const handleLinkPress = (url: string) => {
    Linking.openURL(url);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <ScrollView style={styles.content}>
        <View style={styles.screen}>
          <Text style={styles.title}>Sitemap</Text>
          <Text style={styles.subtitle}>Navigate to different sections</Text>
          
          {links.map((link, index) => (
            <View key={index} style={styles.linkCard}>
              <Text style={styles.linkTitle}>{link.title}</Text>
              <Text style={styles.linkUrl}>{link.url}</Text>
              <View style={styles.linkButton}>
                <Text 
                  style={styles.linkButtonText}
                  onPress={() => handleLinkPress(link.url)}
                >
                  Open
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
