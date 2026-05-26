import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity } from 'react-native';
import { Theme } from '../../constants/Theme';
import { useAuth } from '../../utils/auth';
import { router } from 'expo-router';
import { subscribeAlerts } from '../../utils/firebase';

interface AlertItem {
  id: string;
  timestamp?: string | number;
  severity?: string;
  level?: string;
  title?: string;
  type?: string;
  pigName?: string;
  message?: string;
  description?: string;
  deviceId?: string;
}

export default function EventsScreen() {
  const user = useAuth();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAlerts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeAlerts((rows) => {
      setAlerts(rows as unknown as AlertItem[]);
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
            Authorized Farmer or Veterinarian login is required to view live acoustic triggers and alert history.
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
      <Text style={styles.headerTitle}>Event Archive</Text>
      <Text style={styles.headerSubtitle}>Searchable log of multimodal triggers</Text>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput 
          style={styles.searchInput}
          placeholder="Search alerts (e.g. 'fever', 'cough')"
          placeholderTextColor={Theme.colors.textMuted}
        />
      </View>

      <View style={styles.systemBox}>
        <Text style={styles.systemBoxTitle}>Firebase RTDB Mapping</Text>
        <Text style={styles.systemBoxText}>
          /users/$uid/alerts/
        </Text>
        <Text style={styles.systemBoxDesc}>
          Trigger: Cough {'>'}= 10/hr + Fever Confirmed
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Recent Events ({alerts.length})</Text>

      {loading && (
        <Text style={styles.emptyText}>Syncing alerts from Firebase…</Text>
      )}
      {!loading && alerts.length === 0 && (
        <Text style={styles.emptyText}>No alerts yet. Live events appear when sensors trigger rules.</Text>
      )}
      {!loading && alerts.map((alert) => {
        const severity = (alert.severity || alert.level || 'INFO').toString().toUpperCase();
        const isCritical = severity.includes('CRIT') || severity.includes('DANGER');
        const isWarning = severity.includes('WARN');
        const badgeColor = isCritical ? Theme.colors.danger : isWarning ? Theme.colors.warning : Theme.colors.primary;
        const ts = alert.timestamp
          ? new Date(typeof alert.timestamp === 'number' ? alert.timestamp : alert.timestamp).toLocaleString()
          : '—';
        return (
          <View key={alert.id} style={styles.eventCard}>
            <View style={styles.eventHeader}>
              <Text style={styles.eventTime}>{ts}</Text>
              <View style={[styles.badge, { backgroundColor: badgeColor + '33' }]}>
                <Text style={[styles.badgeText, { color: badgeColor }]}>{severity}</Text>
              </View>
            </View>
            <Text style={styles.eventTitle}>{alert.title || alert.type || alert.pigName || 'Alert'}</Text>
            <Text style={styles.eventDesc}>
              {alert.message || alert.description || JSON.stringify(alert)}
            </Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.pill,
    paddingHorizontal: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    marginBottom: Theme.spacing.lg,
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Theme.colors.text,
    height: 50,
    fontSize: Theme.typography.body,
  },
  systemBox: {
    backgroundColor: '#0D0D1A',
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.secondary + '44',
    marginBottom: Theme.spacing.xl,
  },
  systemBoxTitle: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  systemBoxText: {
    color: Theme.colors.secondary,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  systemBoxDesc: {
    color: Theme.colors.textSecondary,
    fontSize: 10,
    marginTop: 6,
    fontStyle: 'italic',
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.md,
  },
  eventCard: {
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    marginBottom: Theme.spacing.md,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Theme.spacing.xs,
  },
  eventTime: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.caption,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.pill,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  eventTitle: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h3,
    fontWeight: 'bold',
    marginTop: 4,
  },
  eventDesc: {
    color: Theme.colors.textSecondary,
    fontSize: Theme.typography.caption,
    marginTop: 8,
    lineHeight: 20,
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
