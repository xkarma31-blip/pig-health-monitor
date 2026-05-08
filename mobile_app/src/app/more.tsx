import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import { Theme } from '../constants/Theme';
import { ResponsiveLayout } from '../components/Layout/ResponsiveLayout';

export default function MoreFeaturesScreen() {
  const router = useRouter();
  const auth = getAuth();
  const isAuth = !!auth.currentUser;

  return (
    <ResponsiveLayout>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>More Features</Text>
      
      <View style={styles.menuGroup}>
        <Text style={styles.groupLabel}>SYSTEM LOGS</Text>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/alerts')}>
          <Text style={styles.menuEmoji}>🔔</Text>
          <Text style={styles.menuText}>Alert History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/sensors')}>
          <Text style={styles.menuEmoji}>🌡️</Text>
          <Text style={styles.menuText}>Sensor Diagnostics</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.menuGroup}>
        <Text style={styles.groupLabel}>ACCOUNT</Text>
        {isAuth ? (
          <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={() => {
            signOut(auth);
            router.push('/dashboard');
          }}>
            <Text style={styles.menuEmoji}>🚪</Text>
            <Text style={[styles.menuText, { color: Theme.colors.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/login')}>
            <Text style={styles.menuEmoji}>🛡️</Text>
            <Text style={styles.menuText}>Sign In</Text>
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>HUSH HOG v2.0.0-Strategic</Text>
        <Text style={styles.versionText}>Sovereign Aqua Protocol</Text>
      </View>
      </ScrollView>
    </View>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.cardBorder,
    backgroundColor: Theme.colors.surface,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: Theme.colors.primary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  content: {
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: Theme.colors.primary,
    marginBottom: 30,
  },
  menuGroup: {
    marginBottom: 24,
  },
  groupLabel: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 8,
    paddingLeft: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    padding: 16,
    borderRadius: Theme.borderRadius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  logoutItem: {
    borderColor: Theme.colors.danger + '44',
    backgroundColor: Theme.colors.danger + '11',
  },
  menuEmoji: {
    fontSize: 20,
    marginRight: 16,
  },
  menuText: {
    color: Theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  versionContainer: {
    marginTop: 40,
    alignItems: 'center',
  },
  versionText: {
    color: Theme.colors.textMuted,
    fontSize: 12,
  }
});
