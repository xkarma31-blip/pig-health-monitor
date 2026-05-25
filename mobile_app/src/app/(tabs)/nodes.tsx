import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Theme } from '../../constants/Theme';
import { useAuth } from '../../utils/auth';
import { router } from 'expo-router';

export default function NodesScreen() {
  const user = useAuth();

  if (!user) {
    return (
      <View style={styles.lockContainer}>
        <View style={styles.lockCard}>
          <Text style={styles.lockIcon}>🔒</Text>
          <Text style={styles.lockTitle}>AUTHENTICATION REQUIRED</Text>
          <Text style={styles.lockText}>
            Authorized Farmer or Veterinarian login is required to monitor active hardware node diagnostics and battery cycles.
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
      <Text style={styles.headerTitle}>Hardware Nodes</Text>
      <Text style={styles.headerSubtitle}>System Health & Connectivity</Text>

      <View style={styles.systemBox}>
        <Text style={styles.systemBoxTitle}>Firebase RTDB Mapping</Text>
        <Text style={styles.systemBoxText}>
          /users/$uid/sensors/
        </Text>
        <Text style={styles.systemBoxDesc}>
          Polling ESP-NOW Signal, Battery, & Firmware Version
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Active Sensors (2)</Text>
      
      {/* Node B (Thermal) */}
      <View style={styles.nodeCard}>
        <View style={styles.nodeHeader}>
          <Text style={styles.nodeIcon}>🎥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nodeName}>Node B (MLX90640)</Text>
            <Text style={styles.nodeFw}>v2.0-DIAGNOSTIC</Text>
          </View>
          <View style={styles.statusDot} />
        </View>
        <View style={styles.nodeMetrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Battery</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.success }]}>84%</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>ESP-NOW</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.primary }]}>-45 dBm</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Status</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.text }]}>Active</Text>
          </View>
        </View>
      </View>

      {/* Node A (Acoustic) */}
      <View style={styles.nodeCard}>
        <View style={styles.nodeHeader}>
          <Text style={styles.nodeIcon}>🎙️</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.nodeName}>Node A (INMP441)</Text>
            <Text style={styles.nodeFw}>v2.0-DIAGNOSTIC</Text>
          </View>
          <View style={styles.statusDot} />
        </View>
        <View style={styles.nodeMetrics}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Battery</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.warning }]}>42%</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>ESP-NOW</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.primary }]}>-52 dBm</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Status</Text>
            <Text style={[styles.metricValue, { color: Theme.colors.text }]}>Active</Text>
          </View>
        </View>
      </View>

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
    borderColor: Theme.colors.success + '44',
    marginBottom: Theme.spacing.lg,
  },
  systemBoxTitle: {
    color: Theme.colors.textMuted,
    fontSize: 12,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  systemBoxText: {
    color: Theme.colors.success,
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
  nodeCard: {
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    marginBottom: Theme.spacing.md,
  },
  nodeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Theme.spacing.md,
  },
  nodeIcon: {
    fontSize: 28,
    marginRight: Theme.spacing.md,
  },
  nodeName: {
    color: Theme.colors.text,
    fontSize: Theme.typography.h3,
    fontWeight: 'bold',
  },
  nodeFw: {
    color: Theme.colors.primaryDim,
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Theme.colors.success,
    shadowColor: Theme.colors.success,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  nodeMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Theme.colors.surface,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.sm,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: Theme.typography.body,
    fontWeight: 'bold',
    fontFamily: 'monospace',
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
