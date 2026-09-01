import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../hooks/useAuth';
import { useWebTheme } from '../../theme/WebThemeContext';
import { TemperatureIcon, AlertIcon, InfoIcon } from '../../components/primitives/Icons';
import { AuthGuard } from '../../components/AuthGuard';

const formatTemperature = (temp: number) => `${temp.toFixed(1)}°C`;
const formatDateTime = (date: Date) => date.toLocaleString();

interface PigData {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  latestTemp: number;
  breed: string;
  age: number;
  lastUpdate: Date;
  location: string;
  weight: number;
}

const generateMockData = (): PigData[] => [
  {
    id: 'PIG-001',
    name: 'Bessie',
    status: 'healthy',
    latestTemp: 38.7,
    breed: 'Yorkshire',
    age: 12,
    lastUpdate: new Date(Date.now() - 5 * 60000),
    location: 'Pen A',
    weight: 85,
  },
  {
    id: 'PIG-002',
    name: 'Daisy',
    status: 'warning',
    latestTemp: 39.8,
    breed: 'Landrace',
    age: 10,
    lastUpdate: new Date(Date.now() - 3 * 60000),
    location: 'Pen B',
    weight: 78,
  },
  {
    id: 'PIG-003',
    name: 'Coco',
    status: 'healthy',
    latestTemp: 38.5,
    breed: 'Duroc',
    age: 8,
    lastUpdate: new Date(Date.now() - 8 * 60000),
    location: 'Pen A',
    weight: 65,
  },
  {
    id: 'PIG-004',
    name: 'Lucy',
    status: 'critical',
    latestTemp: 40.2,
    breed: 'Hampshire',
    age: 15,
    lastUpdate: new Date(Date.now() - 2 * 60000),
    location: 'Pen C',
    weight: 92,
  },
];

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const { theme } = useWebTheme();
  const router = useRouter();

  const [pigs, setPigs] = useState<PigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate API call with real data structure
      await new Promise(resolve => setTimeout(resolve, 1000));
      const mockData = generateMockData();
      setPigs(mockData);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to load pig data. Please check your connection.');
      // eslint-disable-next-line no-console
      console.error('Error loading pig data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      await refresh();
      if (mounted) {
        // Data loaded
      }
    };
    loadData();
    return () => { mounted = false; };
  }, [refresh]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handlePigPress = (pigId: string) => {
    router.push(`/web/nodes/${pigId}`);
  };

  const handleAddPig = () => {
    router.push('/web/nodes');
  };

  const handleViewEvents = () => {
    router.push('/web/events');
  };

  const handleViewAnalytics = () => {
    router.push('/web/analytics');
  };

  const handleViewAI = () => {
    router.push('/web/edge-impulse');
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  const stats = useMemo(() => {
    if (!pigs.length) return { total: 0, healthy: 0, warning: 0, critical: 0, avgTemp: 0 };

    const total = pigs.length;
    const healthy = pigs.filter(p => p.status === 'healthy').length;
    const warning = pigs.filter(p => p.status === 'warning').length;
    const critical = pigs.filter(p => p.status === 'critical').length;
    const avgTemp = pigs.reduce((sum, p) => sum + p.latestTemp, 0) / total || 0;

    return { total, healthy, warning, critical, avgTemp };
  }, [pigs]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return theme.colors.success;
      case 'warning': return theme.colors.warning;
      case 'critical': return theme.colors.error;
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✓';
      case 'warning': return '⚠';
      case 'critical': return '✗';
      default: return '?';
    }
  };

  const quickActions = [
    {
      id: 'add-pig',
      label: 'Add Pig',
      icon: '➕',
      onPress: handleAddPig,
      color: theme.colors.primary,
      description: 'Register a new pig to monitoring',
    },
    {
      id: 'view-events',
      label: 'View Events',
      icon: '📋',
      onPress: handleViewEvents,
      color: theme.colors.secondary,
      description: 'Recent health events and alerts',
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: '📈',
      onPress: handleViewAnalytics,
      color: theme.colors.accent,
      description: 'Detailed health analytics',
    },
    {
      id: 'ai-ml',
      label: 'AI/ML',
      icon: '🤖',
      onPress: handleViewAI,
      color: theme.colors.tertiary,
      description: 'Machine learning models',
    },
  ];

  return (
    <AuthGuard>
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
        <ScrollView
          style={styles.scrollView}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={styles.content}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={[styles.greeting, { color: theme.colors.textPrimary }]}>
                Welcome back, {user?.displayName || user?.email?.split('@')[0] || 'Farmer'}! 🐷
              </Text>
              <Text style={[styles.subtitle, { color: theme.colors.textSecondary }]}>
                {pigs.length} pigs monitored • Last updated: {formatDateTime(lastRefresh)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.logoutBtn, { backgroundColor: theme.colors.surface }]}
              onPress={handleLogout}
              accessibilityLabel="Sign out"
              accessibilityHint="Sign out of your account"
              accessibilityRole="button"
            >
              <Text style={{ color: theme.colors.textPrimary }}>Sign Out</Text>
            </TouchableOpacity>
          </View>

          {/* Health Overview */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Herd Health Overview</Text>
            <View style={[styles.statsCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.colors.success }]}>{stats.healthy}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Healthy</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.colors.warning }]}>{stats.warning}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Warning</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.colors.error }]}>{stats.critical}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Critical</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.colors.textPrimary }]}>{stats.total}</Text>
                  <Text style={[styles.statLabel, { color: theme.colors.textSecondary }]}>Total</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Temperature Analysis */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Temperature Analysis</Text>
            <View style={[styles.tempCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.tempHeader}>
                <TemperatureIcon size={24} color={theme.colors.primary} />
                <Text style={[styles.tempTitle, { color: theme.colors.textPrimary }]}>Average Herd Temperature</Text>
              </View>
              <Text style={[styles.tempValue, { color: theme.colors.textPrimary }]}>
                {formatTemperature(stats.avgTemp)}
              </Text>
              <Text style={[styles.tempSubtitle, { color: theme.colors.textSecondary }]}>
                Normal range: 38.7°C - 39.8°C
              </Text>
              <View style={styles.tempIndicator}>
                <View style={[styles.tempBar, {
                  width: `${Math.min(100, Math.max(0, (stats.avgTemp - 38) / 3 * 100))}%`,
                  backgroundColor: getTemperatureColor(stats.avgTemp, theme)
                }]} />
              </View>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Quick Actions</Text>
            <View style={styles.actionsGrid}>
              {quickActions.map((action) => (
                <TouchableOpacity
                  key={action.id}
                  style={[styles.actionCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                  onPress={action.onPress}
                  accessibilityLabel={action.label}
                  accessibilityHint={action.description}
                  accessibilityRole="button"
                >
                  <Text style={[styles.actionIcon, { color: action.color }]}>{action.icon}</Text>
                  <Text style={[styles.actionLabel, { color: theme.colors.textPrimary }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Recent Pigs */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.textPrimary }]}>Recent Pigs</Text>
              <TouchableOpacity onPress={handleAddPig}>
                <Text style={[styles.seeAll, { color: theme.colors.primary }]}>Add New</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loading}>
                <Text style={{ color: theme.colors.textSecondary }}>Loading pig data...</Text>
              </View>
            ) : error ? (
              <View style={[styles.error, { backgroundColor: theme.colors.error + '20', borderColor: theme.colors.error }]}>
                <AlertIcon size={24} color={theme.colors.error} />
                <Text style={{ color: theme.colors.error, marginTop: 8 }}>{error}</Text>
                <TouchableOpacity
                  style={[styles.retryBtn, { backgroundColor: theme.colors.error }]}
                  onPress={handleRefresh}
                  accessibilityRole="button"
                  accessibilityLabel="Retry loading pigs data"
                  accessibilityHint="Tap to reload pig monitoring data"
                >
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : pigs.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <InfoIcon size={48} color={theme.colors.textSecondary} />
                <Text style={[styles.emptyText, { color: theme.colors.textPrimary, marginTop: 12 }]}>No pigs registered</Text>
                <Text style={[styles.emptySubtext, { color: theme.colors.textSecondary }]}>Add your first pig to start monitoring</Text>
                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: theme.colors.primary, marginTop: 16 }]}
                  onPress={handleAddPig}
                  accessibilityRole="button"
                  accessibilityLabel="Add new pig"
                  accessibilityHint="Navigate to pig registration screen"
                >
                  <Text style={styles.primaryBtnText}>Add Pig</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.pigList}>
                {pigs.slice(0, 4).map((pig) => (
                  <TouchableOpacity
                    key={pig.id}
                    style={[styles.pigCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
                    onPress={() => handlePigPress(pig.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${pig.name}`}
                    accessibilityHint={`View ${pig.name} monitoring details and temperature history`}
                  >
                    <View style={styles.pigCardLeft}>
                      <View style={[styles.pigAvatar, { backgroundColor: getStatusColor(pig.status) }]}>
                        <Text style={styles.pigAvatarText}>{pig.name[0]?.toUpperCase() || '🐷'}</Text>
                      </View>
                      <View style={styles.pigInfo}>
                        <Text style={[styles.pigName, { color: theme.colors.textPrimary }]}>{pig.name}</Text>
                        <Text style={[styles.pigDetails, { color: theme.colors.textSecondary }]}>
                          {pig.breed} • {pig.age} months • {pig.location}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.pigCardRight}>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(pig.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(pig.status) }]}>
                          {getStatusIcon(pig.status)} {pig.status.toUpperCase()}
                        </Text>
                      </View>
                      <Text style={[styles.pigTemp, { color: theme.colors.textPrimary }]}>
                        {formatTemperature(pig.latestTemp)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </AuthGuard>
  );
}

function getTemperatureColor(temp: number, theme: { colors: { success: string; warning: string; error: string } }) {
  if (temp < 38.5) return theme.colors.success;
  if (temp < 39.8) return theme.colors.warning;
  return theme.colors.error;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  content: { padding: 20, paddingBottom: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    marginTop: 12,
  },
  headerLeft: { flex: 1 },
  greeting: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  logoutBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 20, fontWeight: '600', marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAll: { fontSize: 14, fontWeight: '500' },
  statsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 12, textTransform: 'uppercase', opacity: 0.8 },
  tempCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  tempHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  tempTitle: { fontSize: 16, fontWeight: '600' },
  tempValue: { fontSize: 36, fontWeight: '700', marginBottom: 8 },
  tempSubtitle: { fontSize: 14, marginBottom: 12 },
  tempIndicator: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  tempBar: {
    height: '100%',
    borderRadius: 4,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  actionCard: {
    flex: 1,
    minWidth: 140,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionIcon: { fontSize: 24, marginBottom: 8 },
  actionLabel: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  loading: { padding: 40, alignItems: 'center' },
  error: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
  },
  retryBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '600' },
  empty: {
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptySubtext: { fontSize: 14, textAlign: 'center', marginTop: 4 },
  primaryBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  pigList: { gap: 12 },
  pigCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  pigCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pigAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pigAvatarText: { fontSize: 20 },
  pigInfo: { gap: 2 },
  pigName: { fontSize: 16, fontWeight: '600' },
  pigDetails: { fontSize: 13 },
  pigCardRight: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  pigTemp: { fontSize: 18, fontWeight: '700', fontFamily: 'monospace' },
});