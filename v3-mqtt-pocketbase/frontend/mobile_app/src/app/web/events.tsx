import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../utils/auth';
import { router } from 'expo-router';
import { subscribeAlerts } from '../../utils/pocketbase-data';

import { ListGroup, EmptyState, SegmentedControl, Badge } from '../../components/primitives';
import { AuthBanner } from '../../components/shared/AuthBanner';
import { AlertIcon, WaveformIcon, ThermometerIcon, SearchIcon } from '../../components/primitives/Icons';

type AlertType = 'thermal' | 'sound' | 'system';
type AlertSeverity = 'info' | 'warning' | 'critical';

interface AlertEvent {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  timestamp: number;
  pigId?: string;
  nodeId?: string;
  temperature?: number;
  soundLevel?: number;
  message: string;
  acknowledged: boolean;
  confidence?: number;
  model?: string;
}

// Map Firebase alert data to our local AlertEvent type
function mapAlertToEvent(alert: Record<string, unknown>): AlertEvent {
  const type = (alert.type as string) || '';
  const severity = (alert.severity as string) || 'INFO';
  const isCough = type.includes('COUGH') || type === 'COUGH_DETECTED';
  const isThermal = type.includes('TEMP') || type.includes('FEVER');

  let mappedType: AlertType = 'system';
  if (isCough) mappedType = 'sound';
  else if (isThermal) mappedType = 'thermal';

  let mappedSeverity: AlertSeverity = 'info';
  if (severity === 'HIGH' || severity === 'CRITICAL') mappedSeverity = 'critical';
  else if (severity === 'MEDIUM' || severity === 'LOW') mappedSeverity = 'warning';

  return {
    id: alert.id as string,
    type: mappedType,
    severity: mappedSeverity,
    timestamp: (alert.timestamp as number) || Date.now(),
    pigId: alert.pigId as string | undefined,
    nodeId: alert.deviceId as string | undefined,
    temperature: alert.temperature as number | undefined,
    soundLevel: alert.soundLevel as number | undefined,
    message: (alert.message as string) || type,
    acknowledged: false,
    confidence: alert.confidence as number | undefined,
    model: alert.model as string | undefined,
  };
}

const ALERT_ICONS = {
  thermal: ThermometerIcon,
  sound: WaveformIcon,
  system: AlertIcon,
};

const SEVERITY_LABELS: Record<AlertSeverity, string> = {
  info: 'INFO',
  warning: 'WARN',
  critical: 'CRITICAL',
};

export default function EventsScreen() {
  const user = useAuth();
  const { colors, spacing, radius, typography } = useTheme();

  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<AlertSeverity | 'all'>('all');

  // Subscribe to live Firebase alerts
  useEffect(() => {
    if (!user) return;
    const unsub = subscribeAlerts((rawAlerts) => {
      setAlerts(rawAlerts.map(mapAlertToEvent));
    });
    return unsub;
  }, [user]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Firebase listener auto-updates; just clear refresh indicator
    setTimeout(() => setRefreshing(false), 1000);
  }, []);

  const openLogin = () => {
    router.push('/login');
  };

  const acknowledgeAlert = (alertId: string) => {
    setAlerts(prev =>
      prev.map(alert =>
        alert.id === alertId ? { ...alert, acknowledged: true } : alert
      )
    );
  };

  const filteredAlerts = alerts.filter(alert =>
    selectedFilter === 'all' || alert.severity === selectedFilter
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.xxl,
    },
    header: {
      marginBottom: spacing.md,
    },
    filterSection: {
      marginBottom: spacing.md,
    },
    searchWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: spacing.md,
    },
    filterRow: {
      marginBottom: spacing.md,
    },
    skeletonContainer: {
      paddingVertical: spacing.sm,
    },
    alertCard: {
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderLeftWidth: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    unacknowledged: {
      borderWidth: 2,
    },
    alertHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    alertTypeRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    alertMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: spacing.sm,
      gap: spacing.md,
    },
    alertIcon: {
      marginRight: spacing.sm,
    },
    alertMessage: {
      flex: 1,
      fontSize: typography.body.fontSize,
      color: colors.text,
    },
    alertFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
    },
    alertTimestamp: {
      fontSize: typography.caption.fontSize,
      color: colors.textMuted,
    },
    alertActions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    actionButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.sm,
      fontSize: typography.caption.fontSize,
      fontWeight: '600' as const,
    },
    acknowledgeButton: {
      backgroundColor: colors.success,
      color: colors.success || colors.white,
    },
    dismissButton: {
      backgroundColor: colors.surface,
      color: colors.textSecondary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.xxl,
    },
    emptyStateIcon: {
      marginBottom: spacing.lg,
    },
    emptyStateText: {
      fontSize: typography.body.fontSize,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 1.5,
    },
    loadingState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    refreshControl: {
      backgroundColor: colors.background,
    },
    filterButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.md,
    },
    filterIcon: {
      marginRight: spacing.sm,
    },
    filterText: {
      fontSize: typography.body.fontSize,
      color: colors.textPrimary,
    },
    activeFilter: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    activeFilterText: {
      color: colors.primary || colors.white,
    },
    itemSeparator: {
      height: 1,
      backgroundColor: colors.divider,
      marginVertical: spacing.sm,
    },
    scrollIndicator: {
      backgroundColor: colors.border,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
      marginTop: spacing.lg,
    },
    sectionTitle: {
      fontSize: typography.title.fontSize,
      fontWeight: typography.title.fontWeight,
      color: colors.textPrimary,
    },
    sectionCount: {
      fontSize: typography.caption.fontSize,
      color: colors.textMuted,
    },
    priorityIndicator: {
      width: 4,
      height: '100%',
      borderRadius: radius.sm,
      marginRight: spacing.md,
    },
    priorityInfo: {
      backgroundColor: colors.info,
    },
    priorityWarning: {
      backgroundColor: colors.warning,
    },
    priorityCritical: {
      backgroundColor: colors.error,
    },
    severityBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
    },
    cardContent: {
      flex: 1,
    },
    cardMeta: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: spacing.sm,
    },
  });

  const getSeverityColors = (severity: AlertSeverity) => {
    switch (severity) {
      case 'info':
        return { bg: colors.surface, text: colors.info, border: colors.border };
      case 'warning':
        return { bg: colors.surface, text: colors.warning, border: colors.warning };
      case 'critical':
        return { bg: colors.surface, text: colors.error, border: colors.error };
      default:
        return { bg: colors.surface, text: colors.text, border: colors.border };
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.accent]}
            progressViewOffset={Platform.OS === 'ios' ? 0 : 100}
          />
        }
      >
        {!user && (
          <AuthBanner
            title="Not authenticated"
            message="Log in to sync live alert data from Firebase"
            buttonLabel="LOG IN"
            onPress={openLogin}
          />
        )}

        <View style={styles.header}>
          <Text style={styles.sectionTitle}>Alert Events</Text>
          <Text style={styles.sectionCount}>{filteredAlerts.length} events</Text>
        </View>

        <View style={styles.filterSection}>
          <SegmentedControl
            options={[
              { key: 'all', label: 'All' },
              { key: 'info', label: 'Info' },
              { key: 'warning', label: 'Warning' },
              { key: 'critical', label: 'Critical' },
            ]}
            value={selectedFilter}
            onChange={(key) => setSelectedFilter(key as AlertSeverity | 'all')}
          />
        </View>

        <View style={styles.searchWrapper}>
          <SearchIcon size={20} color={colors.textSecondary} />
          <Text style={styles.filterText}>Search events...</Text>
        </View>

        {filteredAlerts.length === 0 ? (
          <EmptyState
            icon={<AlertIcon />}
            title="No events found"
            message="No alerts match your current filter criteria"
          />
        ) : (
          <ListGroup>
            {filteredAlerts.map((alert) => {
              const IconComponent = ALERT_ICONS[alert.type];
              const severityColors = getSeverityColors(alert.severity);
              const isUnacknowledged = !alert.acknowledged;
              
              return (
                <View
                  key={alert.id}
                  style={[
                    styles.alertCard,
                    isUnacknowledged && styles.unacknowledged,
                    {
                      borderLeftColor: severityColors.border,
                    },
                  ]}
                >
                  <View style={styles.alertHeader}>
                    <View style={styles.alertTypeRow}>
                      <IconComponent size={20} color={colors.textSecondary} />
                      <Text style={styles.alertMessage}>{alert.message}</Text>
                    </View>
                    <Badge
                      label={SEVERITY_LABELS[alert.severity]}
                      status={alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'high' : 'info'}
                    />
                  </View>
                  
                  <View style={styles.alertMeta}>
                    {alert.pigId && (
                      <Text style={styles.alertTimestamp}>Pig: {alert.pigId}</Text>
                    )}
                    {alert.nodeId && (
                      <Text style={styles.alertTimestamp}>Node: {alert.nodeId}</Text>
                    )}
                    {alert.temperature && (
                      <Text style={styles.alertTimestamp}>Temp: {alert.temperature}°C</Text>
                    )}
                    <Text style={styles.alertTimestamp}>
                      {new Date(alert.timestamp).toLocaleString()}
                    </Text>
                  </View>

                  {isUnacknowledged && (
                    <View style={styles.alertFooter}>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.acknowledgeButton]}
                        onPress={() => acknowledgeAlert(alert.id)}
                        accessibilityLabel="Acknowledge alert"
                        accessibilityHint="Mark this alert as acknowledged"
                      >
                        <Text style={{ color: colors.white }}>Acknowledge</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}
          </ListGroup>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}