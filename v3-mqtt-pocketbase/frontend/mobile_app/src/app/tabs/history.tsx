import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '../../theme';
import { SegmentedControl } from '../../components/primitives/SegmentedControl';
import { HistoryLiveView } from '../../components/HistoryLiveView';
import {
  HISTORY_SEGMENT_OPTIONS,
  parseHistorySection,
  type HistorySection,
} from '../../utils/history-navigation';

/**
 * History tab (lane B2).
 *
 * Hosts three sections behind `?section=history|live|prediction`. The old Live
 * screen moved in as the `live` section; its retired route redirects here. The
 * section is query-backed so a selection survives refresh and back/forward on
 * web and native.
 *
 * Integration status: the Live section is fully wired. The History and
 * Prediction sections are explicit placeholders — their data contracts are
 * owned by the next lane (B3) and NOTHING here fabricates readings, charts or
 * forecasts. This screen is therefore not complete as a data feature.
 */
export default function HistoryScreen() {
  const { colors, spacing, typography, radius } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string | string[] }>();
  const isFocused = useIsFocused();

  // The URL query is the single source of truth: a section change is a param
  // write, so refresh and back/forward land on the same section with no state
  // that can drift out of sync.
  const { section, source } = parseHistorySection(params.section);

  const select = (key: HistorySection) => {
    try {
      router.setParams({ section: key });
    } catch {
      /* setParams can fail two ways: before navigation mounts it throws
         (assertIsReady) and we land here; after mount a null navigationRef is
         a silent no-op and nothing reaches this catch. Either way the visible
         section stays as-is and the controlled segment reverts to the resolved
         section. */
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg, paddingTop: spacing.lg }]}>
        <Text style={[typography.h1, { color: colors.textPrimary }]}>History</Text>
        <Text style={[typography.bodySmall, { color: colors.textSecondary, marginTop: 4 }]}>
          Recorded trends, the live barn feed and environmental prediction.
        </Text>
        <View style={{ marginTop: spacing.md }}>
          <SegmentedControl<HistorySection>
            options={[...HISTORY_SEGMENT_OPTIONS]}
            value={section}
            onChange={select}
          />
        </View>
        {source === 'invalid' ? (
          <Text
            accessibilityRole="alert"
            style={[
              typography.bodySmall,
              {
                color: colors.watch,
                marginTop: spacing.sm,
                backgroundColor: colors.surface,
                borderRadius: radius.sm,
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            Unrecognized history section — showing History.
          </Text>
        ) : null}
      </View>

      {/*
        Live section: mount the real panel only while this section is active AND
        the tab itself is focused. The conditional render is what unmounts the
        hidden feed/readers on inner selection or on losing tab focus (expo
        headless Tabs keep inactive screens mounted, so gating has to live here).
      */}
      {section === 'live' ? (
        isFocused ? <HistoryLiveView /> : null
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxl + 72 }}
          showsVerticalScrollIndicator={false}
        >
          {section === 'history' ? (
            <PendingPanel
              title="Recorded history"
              intro="Environmental and acoustic history with period, source, units and coverage will appear here once the offline history/query contract is wired."
              items={[
                'Period / timezone / source selection',
                'Normalized epoch seconds-vs-ms query bounds',
                'Environment trends for temperature and humidity',
                'Coverage plus valid / missing / excluded sample counts',
                'Chart gaps stay gaps — no zero imputation',
              ]}
              footer="No readings or charts are fabricated on this screen."
            />
          ) : (
            <PendingPanel
              title="Environmental prediction"
              intro="Ambient temperature and humidity forecast (target/units, horizon, source, input cutoff, coverage, model/baseline revision, uncertainty) is unavailable in this build. There is no forecast producer to call and none is assumed to exist."
              items={[
                'Unavailable: no validated producer-age (source age) contract',
                'Unavailable: no validated coverage / regular-sampling window',
                'Unavailable: no evaluated model',
                'Ambient sources are distinct and must not be combined:',
                's3-mic ambient (SHT air) vs pi-thermal ambient (instrument Ta)',
                'Readiness states (capability only): unsupported source · no history · partial history · stale/invalid input · no evaluated model · ready',
              ]}
              footer="No forecast numbers are shown — no evaluated model exists in this build."
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

type PendingPanelProps = {
  title: string;
  intro: string;
  items: string[];
  footer: string;
};

/** Honest placeholder for a section whose data contract is not wired yet. */
function PendingPanel({ title, intro, items, footer }: PendingPanelProps) {
  const { colors, spacing, typography, radius } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.divider,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: radius.md,
        padding: spacing.lg,
      }}
    >
      <Text style={[typography.h2, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm }]}>{intro}</Text>
      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        {items.map((item) => (
          <Text key={item} style={[typography.bodySmall, { color: colors.textMuted }]}>
            • {item}
          </Text>
        ))}
      </View>
      <Text
        style={[
          typography.bodySmall,
          {
            color: colors.watch,
            marginTop: spacing.md,
            fontWeight: '600',
          },
        ]}
      >
        {footer}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingBottom: 0 },
});
