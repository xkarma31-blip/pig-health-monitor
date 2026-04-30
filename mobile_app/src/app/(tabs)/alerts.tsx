/**
 * 🔔 Alerts Screen (Tab 3)
 *
 * Shows a chronological log of all health alerts, a cough frequency
 * trend chart (last 8 hours, hourly buckets), and alert filtering
 * by cough type (ALL / INFECTIOUS / NON-INFECTIOUS / WARNING).
 *
 * Chart: custom SVG bar chart — zero external dependencies.
 * Data: aggregated from Firebase RTDB alerts node.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions,
} from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';
import { Theme } from '../../constants/Theme';
import { AlertRow } from '../../components/AlertRow';
import { subscribeAlerts } from '../../utils/firebase';

import { getAuth } from 'firebase/auth';

const CHART_HEIGHT = 120;
const BAR_SLOT_COUNT = 8;               // last 8 hours

type FilterType = 'ALL' | 'INFECTIOUS' | 'NON_INFECTIOUS' | 'WARNING';

// ── Utility: Bucket alerts into hourly slots (last N hours) ──────────────────
function buildCoughTrend(alerts: any[], hours = BAR_SLOT_COUNT) {
  const now = Date.now();
  const buckets: number[] = new Array(hours).fill(0);

  alerts.forEach((alert) => {
    const ts = alert.timestamp || alert.createdAt || 0;
    const msAgo = now - ts;
    const hoursAgo = Math.floor(msAgo / (1000 * 60 * 60));
    if (hoursAgo < hours && (
      alert.type === 'INFECTIOUS_COUGH' ||
      alert.type === 'NON_INFECTIOUS_COUGH' ||
      alert.type === 'COUGH_DETECTED'
    )) {
      // Most recent = rightmost bar (index hours-1)
      buckets[hours - 1 - hoursAgo]++;
    }
  });
  return buckets;
}

// ── Cough Trend Bar Chart (custom SVG) ───────────────────────────────────────
function CoughTrendChart({ data, chartWidth }: { data: number[]; chartWidth: number }) {
  const maxVal = Math.max(...data, 1); // avoid /0
  const barW = (chartWidth - 32) / data.length;
  const barGap = 4;
  const effectiveBarW = barW - barGap;
  const chartBottom = CHART_HEIGHT - 20; // leave space for labels

  return (
    <View style={chartStyles.wrapper}>
      <Text style={chartStyles.title}>🫁 Cough Frequency — Last 8h</Text>
      <Svg width={chartWidth} height={CHART_HEIGHT + 8}>
        {/* Baseline */}
        <Line
          x1={0} y1={chartBottom} x2={chartWidth} y2={chartBottom}
          stroke={Theme.colors.cardBorder} strokeWidth={1}
        />
        {data.map((val, i) => {
          const barHeight = val === 0 ? 2 : (val / maxVal) * (chartBottom - 8);
          const x = 16 + i * barW;
          const y = chartBottom - barHeight;
          const isHigh = val >= 3;
          const barColor = isHigh ? Theme.colors.danger : val > 0 ? '#f5a623' : Theme.colors.cardBorder;

          // Label: "-7h", "-6h" … "Now"
          const label = i === data.length - 1 ? 'Now' : `-${data.length - 1 - i}h`;

          return (
            <G key={i}>
              <Rect
                x={x}
                y={y}
                width={effectiveBarW}
                height={barHeight}
                rx={3}
                fill={barColor}
                opacity={0.85}
              />
              {val > 0 && (
                <SvgText
                  x={x + effectiveBarW / 2}
                  y={y - 4}
                  fontSize={9}
                  fill={barColor}
                  textAnchor="middle"
                  fontWeight="bold"
                >
                  {val}
                </SvgText>
              )}
              <SvgText
                x={x + effectiveBarW / 2}
                y={chartBottom + 14}
                fontSize={9}
                fill={Theme.colors.textMuted}
                textAnchor="middle"
              >
                {label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      <Text style={chartStyles.legend}>
        {'🟡 Cough detected   🔴 High frequency (≥3)'}
      </Text>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
  },
  title: {
    color: Theme.colors.text,
    fontSize: Theme.typography.body,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.sm,
  },
  legend: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.caption,
    marginTop: Theme.spacing.xs,
    textAlign: 'center',
  },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'INFECTIOUS', label: '🔴 Infectious' },
  { key: 'NON_INFECTIOUS', label: '🟡 Non-Infect' },
  { key: 'WARNING', label: '⚠️ Warnings' },
];

export default function AlertsScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = width - 48; // 24px padding each side

  const [alerts, setAlerts] = useState<any[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLive, setIsLive] = useState(false);
  const [filter, setFilter] = useState<FilterType>('ALL');

  useEffect(() => {
    const unsubAuth = getAuth().onAuthStateChanged((user) => {
      if (user) {
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setIsLive(false);
        setAlerts([]);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    
    const unsub = subscribeAlerts((liveAlerts) => {
      if (liveAlerts.length > 0) {
        // Sort by timestamp DESC so newest appears first in list and chart is chronological
        const sorted = [...liveAlerts].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        setAlerts(sorted);
        setIsLive(true);
      } else {
        setAlerts([]);
        setIsLive(false);
      }
    });
    return () => unsub();
  }, [isAuthenticated]);

  // Memoised derived data
  const trendData = useMemo(() => buildCoughTrend(alerts), [alerts]);

  const filteredAlerts = useMemo(() => {
    if (filter === 'ALL') return alerts;
    if (filter === 'INFECTIOUS') return alerts.filter((a) => a.type === 'INFECTIOUS_COUGH');
    if (filter === 'NON_INFECTIOUS') return alerts.filter((a) => a.type === 'NON_INFECTIOUS_COUGH');
    if (filter === 'WARNING') return alerts.filter((a) =>
      a.type === 'STORAGE_FULL' || a.severity === 'WARNING'
    );
    return alerts;
  }, [alerts, filter]);

  const infectiousCount = alerts.filter((a) => a.type === 'INFECTIOUS_COUGH').length;
  const nonInfectCount = alerts.filter((a) => a.type === 'NON_INFECTIOUS_COUGH').length;
  const warningCount = alerts.filter((a) => a.severity === 'WARNING').length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isLive && (
        <View style={styles.liveBanner}>
          <Text style={styles.liveBannerText}>🔴 LIVE — Firebase RTDB</Text>
        </View>
      )}

      {/* === Cough Trend Chart === */}
      <CoughTrendChart data={trendData} chartWidth={chartWidth} />

      {/* === Summary Stats === */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryBox, { borderColor: Theme.colors.danger }]}>
          <Text style={[styles.summaryValue, { color: Theme.colors.danger }]}>{infectiousCount}</Text>
          <Text style={styles.summaryLabel}>🔴 Infectious</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: '#f5a623' }]}>
          <Text style={[styles.summaryValue, { color: '#f5a623' }]}>{nonInfectCount}</Text>
          <Text style={styles.summaryLabel}>🟡 Non-Infect</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: Theme.colors.warning }]}>
          <Text style={[styles.summaryValue, { color: Theme.colors.warning }]}>{warningCount}</Text>
          <Text style={styles.summaryLabel}>⚠️ Warnings</Text>
        </View>
        <View style={[styles.summaryBox, { borderColor: Theme.colors.info }]}>
          <Text style={[styles.summaryValue, { color: Theme.colors.info }]}>{alerts.length}</Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      {/* === Filter Pills === */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterPill, filter === key && styles.filterPillActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterPillText, filter === key && styles.filterPillTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* === Alert History === */}
      <Text style={styles.sectionTitle}>
        Alert History {filter !== 'ALL' ? `— ${filter.replace('_', ' ')}` : ''}
      </Text>
      {filteredAlerts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>✅ No alerts in this category.</Text>
        </View>
      ) : (
        filteredAlerts.map((alert) => (
          <AlertRow key={alert.id} alert={alert} />
        ))
      )}

      {/* Status Notice */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          {isLive
            ? '🔥 Live alert feed from Firebase RTDB.\nInfectious coughs trigger HIGH severity. Non-infectious = LOW.'
            : '⚠️ Showing sample data. Real alerts stream from ESP32.'}
        </Text>
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
    paddingBottom: Theme.spacing.xxl,
  },
  liveBanner: {
    alignSelf: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs,
    backgroundColor: '#66fcf1' + '22',
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#66fcf1',
    marginBottom: Theme.spacing.md,
  },
  liveBannerText: {
    color: '#66fcf1',
    fontSize: Theme.typography.caption,
    fontWeight: 'bold',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.lg,
    gap: Theme.spacing.xs,
  },
  summaryBox: {
    flex: 1,
    backgroundColor: Theme.colors.card,
    padding: Theme.spacing.sm,
    borderRadius: Theme.borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  summaryValue: {
    fontSize: Theme.typography.h2,
    fontWeight: 'bold',
  },
  summaryLabel: {
    fontSize: 10,
    color: Theme.colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: Theme.spacing.md,
  },
  filterPill: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    marginRight: Theme.spacing.sm,
    backgroundColor: Theme.colors.card,
  },
  filterPillActive: {
    backgroundColor: '#66fcf1',
    borderColor: '#66fcf1',
  },
  filterPillText: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.caption,
    fontWeight: '500',
  },
  filterPillTextActive: {
    color: Theme.colors.background,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: Theme.typography.h2,
    color: Theme.colors.text,
    fontWeight: 'bold',
    marginBottom: Theme.spacing.md,
  },
  emptyState: {
    padding: Theme.spacing.xl,
    alignItems: 'center',
  },
  emptyStateText: {
    color: Theme.colors.textMuted,
    fontSize: Theme.typography.body,
  },
  notice: {
    marginTop: Theme.spacing.xl,
    padding: Theme.spacing.md,
    backgroundColor: Theme.colors.surface,
    borderRadius: Theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: Theme.colors.warning + '44',
    borderStyle: 'dashed',
  },
  noticeText: {
    color: Theme.colors.textMuted,
    textAlign: 'center',
    fontSize: Theme.typography.caption,
  },
});
