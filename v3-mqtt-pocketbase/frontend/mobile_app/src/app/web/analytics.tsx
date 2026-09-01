import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '../../theme';
import { useAuth } from '../../utils/auth';
import { router } from 'expo-router';

import { ListGroup, Skeleton } from '../../components/primitives';
import { AuthBanner } from '../../components/shared/AuthBanner';

interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  pigId?: string;
}

interface AnalyticsData {
  temperature: TimeSeriesPoint[];
  sound: TimeSeriesPoint[];
  activity: TimeSeriesPoint[];
  alerts: { timestamp: number; severity: 'info' | 'warning' | 'critical' }[];
}

const generateMockData = (days: number): AnalyticsData => {
  const now = Date.now();
  const dayMs = 86400000;
  const data: AnalyticsData = {
    temperature: [],
    sound: [],
    activity: [],
    alerts: [],
  };

  for (let d = days - 1; d >= 0; d--) {
    const dayStart = now - d * dayMs;
    const pointsPerDay = 24;

    for (let h = 0; h < pointsPerDay; h++) {
      const t = dayStart + h * 3600000;
      const baseTemp = 38.5 + Math.sin(h / 24 * Math.PI * 2) * 0.8 + (Math.random() - 0.5) * 0.5;
      data.temperature.push({ timestamp: t, value: Math.max(37, Math.min(41, baseTemp)) });

      const baseSound = 45 + Math.sin(h / 24 * Math.PI * 2) * 15 + Math.random() * 20;
      data.sound.push({ timestamp: t, value: Math.max(30, Math.min(100, baseSound)) });

      const baseActivity = 50 + Math.sin(h / 24 * Math.PI * 2) * 30 + Math.random() * 20;
      data.activity.push({ timestamp: t, value: Math.max(0, Math.min(100, baseActivity)) });
    }
  }

  const alertSeverities: ('info' | 'warning' | 'critical')[] = ['info', 'warning', 'critical'];
  for (let i = 0; i < 20; i++) {
    data.alerts.push({
      timestamp: now - Math.random() * days * dayMs,
      severity: alertSeverities[Math.floor(Math.random() * alertSeverities.length)],
    });
  }

  return data;
};

const TIME_RANGES = [
  { label: '24H', value: 1 },
  { label: '7D', value: 7 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
] as const;

type TimeRange = typeof TIME_RANGES[number]['value'];

export default function AnalyticsScreen() {
  const user = useAuth();
  const { colors, spacing, typography } = useTheme();
  const styles = useAnalyticsStyles(colors);

  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<'temperature' | 'sound' | 'activity'>('temperature');

  useEffect(() => {
    setTimeout(() => {
      setData(generateMockData(timeRange));
      setLoading(false);
    }, 600);
  }, [timeRange]);

  const metrics = useMemo(() => {
    if (!data) return null;

    const recentTemp = data.temperature.slice(-24);
    const recentSound = data.sound.slice(-24);
    const recentActivity = data.activity.slice(-24);

    const avgTemp = recentTemp.reduce((a, b) => a + b.value, 0) / recentTemp.length;
    const maxTemp = Math.max(...recentTemp.map(p => p.value));
    const minTemp = Math.min(...recentTemp.map(p => p.value));

    const avgSound = recentSound.reduce((a, b) => a + b.value, 0) / recentSound.length;
    const maxSound = Math.max(...recentSound.map(p => p.value));

    const avgActivity = recentActivity.reduce((a, b) => a + b.value, 0) / recentActivity.length;

    const criticalAlerts = data.alerts.filter(a => a.severity === 'critical').length;
    const warningAlerts = data.alerts.filter(a => a.severity === 'warning').length;

    const tempTrend = recentTemp.length >= 2
      ? recentTemp[recentTemp.length - 1].value - recentTemp[0].value
      : 0;

    return {
      temperature: { avg: avgTemp, max: maxTemp, min: minTemp, trend: tempTrend },
      sound: { avg: avgSound, max: maxSound, trend: 0 },
      activity: { avg: avgActivity, trend: 0 },
      alerts: { critical: criticalAlerts, warning: warningAlerts, total: data.alerts.length },
    };
  }, [data]);

  const openLogin = () => router.push('/login');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {!user && (
          <AuthBanner
            title="Not authenticated"
            message="Log in to view analytics synced from Firebase"
            buttonLabel="LOG IN"
            onPress={openLogin}
          />
        )}

        <View style={styles.header}>
          <Text style={[typography.h1, { color: colors.textPrimary }]}>Analytics</Text>
          <Text style={[typography.caption, { color: colors.textSecondary, marginTop: 2 }]}>
            Statistical insights & trend analysis
          </Text>
        </View>

        {/* Time Range Selector */}
        <View style={styles.timeRangeSelector}>
          {TIME_RANGES.map((range, _index) => (
            <TouchableOpacity
              key={range.value}
              style={[
                styles.timeRangeButton,
                timeRange === range.value && styles.timeRangeButtonActive,
              ]}
              onPress={() => setTimeRange(range.value)}
              accessibilityRole="button"
              accessibilityLabel={`${range.label} time range`}
              accessibilityHint={`Shows analytics for the last ${range.value} days`}
            >
              <Text style={[
                typography.bodySmall,
                { color: timeRange === range.value ? colors.background : colors.textPrimary, fontWeight: '600' },
              ]}>
                {range.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Key Metrics Grid */}
        {loading ? (
          <View style={styles.metricsGrid}>
            {[1, 2, 3, 4].map(i => <Skeleton key={i} />)}
          </View>
        ) : metrics ? (
          <>
            <View style={[styles.alertSummaryCard, { borderLeftColor: colors.accent }]}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Avg Temperature</Text>
              <Text style={[typography.h1, { color: colors.accent, fontSize: 24 }]}>{metrics.temperature.avg.toFixed(1)}°C</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Range: {metrics.temperature.min.toFixed(1)}–{metrics.temperature.max.toFixed(1)}°C</Text>
            </View>
            <View style={[styles.alertSummaryCard, { borderLeftColor: colors.error }]}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Max Temperature</Text>
              <Text style={[typography.h1, { color: colors.error, fontSize: 24 }]}>{metrics.temperature.max.toFixed(1)}°C</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>{metrics.temperature.max > 39.5 ? 'Above critical' : 'Normal range'}</Text>
            </View>
            <View style={[styles.alertSummaryCard, { borderLeftColor: colors.info }]}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Avg Sound Level</Text>
              <Text style={[typography.h1, { color: colors.info, fontSize: 24 }]}>{metrics.sound.avg.toFixed(0)} dB</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Peak: {metrics.sound.max.toFixed(0)} dB</Text>
            </View>
            <View style={[styles.alertSummaryCard, { borderLeftColor: colors.successContainer }]}>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Avg Activity</Text>
              <Text style={[typography.h1, { color: colors.healthy, fontSize: 24 }]}>{metrics.activity.avg.toFixed(0)}%</Text>
              <Text style={[typography.caption, { color: colors.textSecondary }]}>Movement index</Text>
            </View>
          </>
        ) : null}

        {/* Alert Summary */}
        {metrics && (
          <View style={styles.section}>
            <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.md }]}>
              Alert Summary ({timeRange === 1 ? '24h' : `${timeRange}d`})
            </Text>
            <View style={styles.alertSummaryGrid}>
              <View style={[styles.alertSummaryCard, { borderLeftColor: colors.error }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase' }]}>Critical</Text>
                <Text style={[typography.h1, { color: colors.error, fontSize: 32 }]}>{metrics.alerts.critical}</Text>
              </View>
              <View style={[styles.alertSummaryCard, { borderLeftColor: colors.warning }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase' }]}>Warning</Text>
                <Text style={[typography.h1, { color: colors.warning, fontSize: 32 }]}>{metrics.alerts.warning}</Text>
              </View>
              <View style={[styles.alertSummaryCard, { borderLeftColor: colors.info }]}>
                <Text style={[typography.caption, { color: colors.textSecondary, textTransform: 'uppercase' }]}>Total</Text>
                <Text style={[typography.h1, { color: colors.info, fontSize: 32 }]}>{metrics.alerts.total}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Chart Placeholder */}
        <View style={styles.chartSection}>
          <View style={styles.chartHeader}>
            <Text style={[typography.h2, { color: colors.textPrimary }]}>Trend Analysis</Text>
            <View style={styles.metricSelector}>
              {(['temperature', 'sound', 'activity'] as const).map(metric => (
                <TouchableOpacity
                  key={metric}
                  style={[
                    styles.metricTab,
                    selectedMetric === metric && styles.metricTabActive,
                  ]}
                  onPress={() => setSelectedMetric(metric)}
                  accessibilityRole="button"
                  accessibilityLabel={`${metric.charAt(0).toUpperCase() + metric.slice(1)} metric`}
                  accessibilityHint={`Shows ${metric} trend analysis`}
                >
                  <Text style={[
                    typography.caption,
                    { color: selectedMetric === metric ? colors.background : colors.textSecondary, fontWeight: '600' },
                  ]}>
                    {metric.charAt(0).toUpperCase() + metric.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.chartContainer}>
            {loading || !data ? (
              <Skeleton />
            ) : (
              <ChartView
                data={data[selectedMetric] || []}
                color={selectedMetric === 'temperature' ? colors.accent : selectedMetric === 'sound' ? colors.info : colors.healthy}
                timeRange={timeRange}
                styles={styles}
              />
            )}
          </View>

          <View style={styles.chartLegend}>
            <Text style={[typography.caption, { color: colors.textSecondary }]}>
              Showing {selectedMetric} over {timeRange === 1 ? '24 hours' : `${timeRange} days`}
            </Text>
            {selectedMetric === 'temperature' && (
              <View style={styles.thresholdLegend}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.healthy }} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Normal (37.5–38.8°C surface)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.warning }} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Elevated (38.9–39.4°C)</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.error }} />
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Critical (≥39.5°C)</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* Statistical Summary */}
        {metrics && (
          <View style={styles.section}>
            <Text style={[typography.h2, { color: colors.textPrimary, marginBottom: spacing.md }]}>
              Statistical Summary
            </Text>
            <ListGroup>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Mean Temperature</Text>
                  <Text style={[typography.h2, { color: colors.textPrimary }]}>{metrics.temperature.avg.toFixed(2)}°C</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Std Deviation</Text>
                  <Text style={[typography.h2, { color: colors.textPrimary }]}>{calculateStdDev(data!.temperature.slice(-24).map(p => p.value)).toFixed(2)}°C</Text>
                </View>
              </View>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Mean Sound Level</Text>
                  <Text style={[typography.h2, { color: colors.textPrimary }]}>{metrics.sound.avg.toFixed(1)} dB</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[typography.caption, { color: colors.textSecondary }]}>Activity Correlation</Text>
                  <Text style={[typography.h2, { color: colors.textPrimary }]}>{calculateCorrelation(
                    data!.temperature.slice(-24).map(p => p.value),
                    data!.activity.slice(-24).map(p => p.value)
                  ).toFixed(2)}</Text>
                </View>
              </View>
            </ListGroup>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function calculateStdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function calculateCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;
  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumX2 = x.reduce((a, b) => a + b * b, 0);
  const sumY2 = y.reduce((a, b) => a + b * b, 0);
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  return denominator === 0 ? 0 : numerator / denominator;
}

function ChartView({ data, color, timeRange: _timeRange, styles }: { data: { timestamp: number; value: number }[]; color: string; timeRange: number; styles: any }) {
  const { colors } = useTheme();

  if (!data || data.length === 0) {
    return (
      <View style={styles.emptyChart}>
        <Text style={[styles.emptyChartText, { color: colors.textSecondary }]}>No data available</Text>
      </View>
    );
  }

  const width = 350;
  const height = 200;
  const padding = 40;
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const points = data.map((d, i) => {
    const x = padding + (i / (data.length - 1 || 1)) * chartWidth;
    const y = padding + chartHeight - ((d.value - minVal) / range) * chartHeight;
    return { x, y };
  });

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <View style={styles.chartWrapper}>
      <View style={{ width, height }}>
        <svg width={width} height={height} style={{ backgroundColor: 'transparent' }}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(frac => (
            <line
              key={frac}
              x1={padding}
              y1={padding + chartHeight * frac}
              x2={width - padding}
              y2={padding + chartHeight * frac}
              stroke={colors.border}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          ))}
          {/* Y-axis labels */}
          {[0, 0.5, 1].map(frac => (
            <text
              key={frac}
              x={padding - 8}
              y={padding + chartHeight * (1 - frac) + 4}
              fill={colors.textSecondary}
              fontSize={10}
              textAnchor="end"
              fontFamily="system-ui"
            >
              {(minVal + range * frac).toFixed(1)}
            </text>
          ))}
          {/* Data line */}
          <path
            d={path}
            stroke={color}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Area under curve */}
          <path
            d={`${path} L ${points[points.length - 1].x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`}
            fill={`${color}33`}
          />
          {/* Temperature threshold lines for temperature metric */}
          {color === colors.accent && (
            <>
              <line
                x1={padding}
                y1={padding + chartHeight * (1 - (38.8 - minVal) / range)}
                x2={width - padding}
                y2={padding + chartHeight * (1 - (38.8 - minVal) / range)}
                stroke={colors.healthy}
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.5}
              />
              <line
                x1={padding}
                y1={padding + chartHeight * (1 - (39.5 - minVal) / range)}
                x2={width - padding}
                y2={padding + chartHeight * (1 - (39.5 - minVal) / range)}
                stroke={colors.error}
                strokeWidth={1}
                strokeDasharray="2,2"
                opacity={0.5}
              />
            </>
          )}
        </svg>
      </View>
    </View>
  );
}

const useAnalyticsStyles = (colors: any) => {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 100 },
    header: { marginBottom: 20 },
    timeRangeSelector: { flexDirection: 'row', gap: 8, marginBottom: 20 },
    timeRangeButton: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: colors.border },
    timeRangeButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    metricSkeleton: { width: '48%', height: 100 } as any,
    section: { marginBottom: 28 },
    alertSummaryGrid: { flexDirection: 'row', gap: 12 },
    alertSummaryCard: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, padding: 16, borderLeftWidth: 4, alignItems: 'center' },
    chartSection: { marginBottom: 28 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    metricSelector: { flexDirection: 'row', gap: 4 },
    metricTab: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    metricTabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    chartContainer: { marginBottom: 16 },
    chartWrapper: { alignItems: 'center' },
    chartSkeleton: { width: '100%', height: 200 },
    emptyChart: { width: '100%', height: 200, alignItems: 'center', justifyContent: 'center' },
    emptyChartText: { fontSize: 16 },
    chartLegend: { paddingHorizontal: 4 },
    thresholdLegend: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
    statRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
    statItem: { flex: 1 },
  });
};