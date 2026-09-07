import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../hooks/useAuth';
import { subscribeRoster, subscribeTelemetry } from '../../utils/pocketbase-data';
import { haptic } from '../../utils/haptics';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { LoadingFallback, NetworkFallback } from '../../components/FallbackComponent';
import { safeAsyncOperation } from '../../utils/errorHandler';

type RosterPig = {
  id: string;
  name?: string;
  tags?: string[];
  healthStatus?: string;
  lastSeen?: string;
  enrolledAt?: string;
};

type TelemetryData = {
  thermalFrame?: string;
  targetX?: number;
  targetY?: number;
  temperature?: number;
  timestamp?: string;
};

const FeedScreen: React.FC = () => {
  const user = useAuth();
  const { colors } = useTheme();
  const [roster, setRoster] = useState<RosterPig[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    try {
      setError(null);

      const rosterData = await safeAsyncOperation(async () => {
        const roster: RosterPig[] = [];
        const unsubscribe = subscribeRoster((data) => {
          roster.push(...data as RosterPig[]);
        });
        unsubscribe(); // Clean up immediately
        return roster;
      }, (err) => {
        setError('Failed to load pig roster');
        console.error('Roster error:', err);
      });

      const telemetryData = await safeAsyncOperation(async () => {
        let telemetry: TelemetryData | null = null;
        const unsubscribe = subscribeTelemetry('default', (data) => {
          telemetry = data as TelemetryData;
        });
        unsubscribe(); // Clean up immediately
        return telemetry;
      }, (err) => {
        setError('Failed to load telemetry data');
        console.error('Telemetry error:', err);
      });

      setRoster(rosterData || []);
      setTelemetry(telemetryData);
    } catch (err) {
      setError('Failed to load data');
      console.error('Feed screen error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  if (loading) {
    return (
      <ErrorBoundary>
        <LoadingFallback message="Loading pig health data..." />
      </ErrorBoundary>
    );
  }

  if (error) {
    return (
      <ErrorBoundary>
        <NetworkFallback />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('Feed screen error:', error, errorInfo);
        setError(error.message);
      }}
    >
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={[styles.header, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Pig Health Monitor</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Real-time monitoring and health tracking
          </Text>
        </View>

        {/* User Status */}
        <View style={[styles.userCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.userStatus, { color: colors.textPrimary }]}>
            Welcome back, {user?.user?.displayName || 'Farmer'}!
          </Text>
          <Text style={[styles.userDetails, { color: colors.textSecondary }]}>
            {roster.length} pigs enrolled | Last updated: {new Date().toLocaleTimeString()}
          </Text>
        </View>

        {/* Telemetry Overview */}
        {telemetry && (
          <View style={[styles.telemetryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Live Telemetry</Text>
            <View style={styles.telemetryGrid}>
              {telemetry.temperature && (
                <View style={[styles.telemetryItem, { backgroundColor: colors.background }]}>
                  <Text style={[styles.telemetryLabel, { color: colors.textSecondary }]}>Temperature</Text>
                  <Text style={[styles.telemetryValue, { color: colors.textPrimary }]}>
                    {telemetry.temperature}°C
                  </Text>
                </View>
              )}
              {telemetry.targetX !== undefined && telemetry.targetY !== undefined && (
                <View style={[styles.telemetryItem, { backgroundColor: colors.background }]}>
                  <Text style={[styles.telemetryLabel, { color: colors.textSecondary }]}>Target Position</Text>
                  <Text style={[styles.telemetryValue, { color: colors.textPrimary }]}>
                    ({telemetry.targetX}, {telemetry.targetY})
                  </Text>
                </View>
              )}
              {telemetry.timestamp && (
                <View style={[styles.telemetryItem, { backgroundColor: colors.background }]}>
                  <Text style={[styles.telemetryLabel, { color: colors.textSecondary }]}>Last Update</Text>
                  <Text style={[styles.telemetryValue, { color: colors.textPrimary }]}>
                    {new Date(telemetry.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Pig Roster */}
        <View style={[styles.rosterCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Pig Roster</Text>
          {roster.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No pigs enrolled yet
              </Text>
              <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
                Add pigs to start monitoring their health
              </Text>
            </View>
          ) : (
            <View style={styles.rosterList}>
              {roster.map((pig) => (
                <TouchableOpacity
                  key={pig.id}
                  style={[styles.pigCard, { backgroundColor: colors.background, borderColor: colors.border }]}
                  onPress={() => {
                    haptic('light');
                    // Navigate to pig details
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${pig.name || 'pig'} details`}
                  accessibilityHint={`View detailed information for ${pig.name || 'pig'} ${pig.id}`}
                >
                  <View style={styles.pigInfo}>
                    <Text style={[styles.pigName, { color: colors.textPrimary }]}>
                      {pig.name || `Pig ${pig.id.slice(-4)}`}
                    </Text>
                    <Text style={[styles.pigId, { color: colors.textSecondary }]}>
                      ID: {pig.id}
                    </Text>
                  </View>
                  <View style={styles.pigStatus}>
                    {pig.healthStatus && (
                      <Text style={[styles.statusText, { color: colors.primary }]}>
                        {pig.healthStatus}
                      </Text>
                    )}
                    {pig.lastSeen && (
                      <Text style={[styles.lastSeen, { color: colors.textSecondary }]}>
                        Seen: {new Date(pig.lastSeen).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Quick Actions */}
        <View style={[styles.actionsCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Quick Actions</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                haptic('medium');
                // Navigate to add pig screen
              }}
              accessibilityRole="button"
              accessibilityLabel="Add new pig"
              accessibilityHint="Start the process to add a new pig to the monitoring system"
            >
              <Text style={styles.actionButtonText}>Add Pig</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.border }]}
              onPress={() => {
                haptic('medium');
                // Navigate to analytics screen
              }}
              accessibilityRole="button"
              accessibilityLabel="View analytics"
              accessibilityHint="Navigate to detailed analytics and reports"
            >
              <Text style={styles.actionButtonText}>Analytics</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.8,
  },
  userCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  userStatus: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  userDetails: {
    fontSize: 14,
    opacity: 0.8,
  },
  telemetryCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  telemetryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  telemetryItem: {
    flex: 1,
    minWidth: 120,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  telemetryLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  telemetryValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  rosterCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  emptyState: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
  rosterList: {
    gap: 12,
  },
  pigCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  pigInfo: {
    flex: 1,
  },
  pigName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 2,
  },
  pigId: {
    fontSize: 12,
    opacity: 0.8,
  },
  pigStatus: {
    alignItems: 'flex-end',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  lastSeen: {
    fontSize: 12,
    opacity: 0.8,
  },
  actionsCard: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default FeedScreen;