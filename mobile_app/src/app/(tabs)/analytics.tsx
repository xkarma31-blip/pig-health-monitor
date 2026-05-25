import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { Theme } from '../../constants/Theme';
import { useAuth } from '../../utils/auth';
import { router } from 'expo-router';
import { enrollPig, subscribeRoster } from '../../utils/firebase';

export default function AnalyticsScreen() {
  const user = useAuth();
  const [roster, setRoster] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoster([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeRoster((rows) => {
      setRoster(rows);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  if (!user) {
    return (
      <View style={styles.lockContainer}>
        <View style={styles.lockCard}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>AUTHENTICATION REQUIRED</Text>
          <Text style={styles.lockText}>
            Authorized Farmer or Veterinarian login is required to access the active herd roster and enroll ROI parameters.
          </Text>
          <TouchableOpacity 
            style={styles.authBtn} 
            onPress={() => router.push('/login')}
            activeOpacity={0.8}
          >
            <Text style={styles.authBtnText}>LOGIN AS FARMER / VET</Text>
          </TouchableOpacity>
        </View>
      </View>
  );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>Roster Analytics</Text>
      <Text style={styles.headerSubtitle}>Manual ROI Enrollment & Health</Text>

      <View style={styles.systemBox}>
        <Text style={styles.systemBoxTitle}>Firebase RTDB Mapping</Text>
        <Text style={styles.systemBoxText}>
          /users/$uid/roster/
        </Text>
        <Text style={styles.systemBoxDesc}>
          Note: Auto-ID dropped for 2027 Defense. Manual ROI only.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.enrollButton}
        activeOpacity={0.8}
        onPress={async () => {
          const defaultName = `Pig-${Date.now().toString(36).slice(-4)}`;
          let name = defaultName;
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.prompt) {
            const entered = window.prompt('Name for new enrollment?', defaultName);
            if (!entered) return;
            name = entered.trim() || defaultName;
          }
          try {
            await enrollPig(name, false);
            Alert.alert('Enrollment', `ENROLL_START sent for "${name}". Check device and roster.`);
          } catch (err) {
            Alert.alert('Enrollment failed', err instanceof Error ? err.message : String(err));
          }
        }}
      >
        <Text style={styles.enrollButtonText}>+ ENROLL NEW PIG</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Active Herd ({roster.length})</Text>

      {loading && <Text style={styles.emptyText}>Loading roster from Firebase…</Text>}
      {!loading && roster.length === 0 && (
        <Text style={styles.emptyText}>No pigs enrolled yet. Use ENROLL NEW PIG above.</Text>
      )}
      {!loading && roster.map((pig) => {
        const status = (pig.healthStatus || 'NORMAL').toString();
        const isCritical = status !== 'NORMAL' || (pig.tags && pig.tags.length > 0);
        return (
          <View key={pig.id} style={styles.rosterCard}>
            <View style={styles.rosterHeader}>
              <Text style={styles.rosterName}>{pig.name || pig.id}</Text>
              <Text style={styles.rosterTemp}>{pig.lastTemp ? `${pig.lastTemp}°C` : '—'}</Text>
            </View>
            <View style={styles.rosterDetails}>
              <Text style={styles.rosterDate}>
                Enrolled: {pig.enrolledAt ? String(pig.enrolledAt).slice(0, 10) : '—'}
              </Text>
              <Text style={isCritical ? styles.statusCritical : styles.statusNormal}>
                {(pig.tags && pig.tags.length) ? pig.tags.join(', ') : status}
              </Text>
            </View>
          </View>
        );
      })}

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.lg,
    paddingBottom: 120,
  },
  headerTitle: {
    fontSize: Theme.typography.h1,
    color: Theme.colors.text,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: Theme.typography.caption,
    color: Theme.colors.primary,
    marginBottom: Theme.spacing.xl,
    letterSpacing: 1,
  },
  systemBox: {
    backgroundColor: '#0D0D1A',
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '44',
    marginBottom: Theme.spacing.lg,
  },
  systemBoxTitle: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  systemBoxText: {
    color: Theme.colors.primary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  systemBoxDesc: {
    color: Theme.colors.warning,
    fontSize: 10,
    marginTop: 6,
    fontWeight: 'bold',
  },
  enrollButton: {
    backgroundColor: Theme.colors.primary,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.pill,
    alignItems: 'center',
    marginBottom: Theme.spacing.xl,
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  enrollButtonText: {
    color: Theme.colors.background,
    fontSize: Theme.typography.h3,
    fontWeight: '900',
    letterSpacing: 2,
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.md,
  },
  rosterCard: {
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    marginBottom: Theme.spacing.sm,
  },
  rosterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
  },
  rosterName: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h2,
    fontWeight: 'bold',
  },
  rosterTemp: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h2,
    fontFamily: 'monospace',
  },
  rosterDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rosterDate: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.caption,
  },
  statusCritical: {
    color: Theme.colors.danger,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  statusNormal: {
    color: Theme.colors.success,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  emptyText: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.body,
    marginVertical: Theme.spacing.md,
    textAlign: 'center',
  },
  lockContainer: {
    flex: 1,
    backgroundColor: '#05050A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.lg,
  },
  lockCard: {
    backgroundColor: Theme.colors.background,
    padding: Theme.spacing.xl,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 2,
    borderColor: Theme.colors.danger,
    alignItems: 'center',
    shadowColor: Theme.colors.danger,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
    width: '100%',
    maxWidth: 400,
  },
  lockIcon: {
    fontSize: 48,
    marginBottom: Theme.spacing.md,
  },
  lockTitle: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h2,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: Theme.spacing.sm,
  },
  lockText: {
    color: Theme.colors.textSecondary,
    fontSize: Theme.typography.body,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Theme.spacing.xl,
  },
  authBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    width: '100%',
    alignItems: 'center',
  },
  authBtnText: {
    color: Theme.colors.background,
    fontSize: Theme.typography.body,
    fontWeight: '900',
    letterSpacing: 1,
  },
});
