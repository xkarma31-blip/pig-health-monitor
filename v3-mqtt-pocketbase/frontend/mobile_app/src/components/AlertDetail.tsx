/**
 * Alert detail — what actually happened, with the capture frame.
 *
 * Opens from a tap on an alert row (mobile + web). Shows:
 *   - the camera capture frame taken at the moment the alert fired (if the Pi
 *     recorded one — the `alerts.frame` field);
 *   - the CAUSE, in plain language, derived from the alert type/severity and
 *     the device reading that triggered it;
 *   - the surrounding device context (nearby telemetry rows for the same
 *     device), so a vet can see what the numbers were doing at that moment.
 *
 * Everything shown is real stored data. When a frame was not captured the
 * component says so plainly rather than showing an empty box.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../theme';
import { pbList } from '../utils/pocketbase';

/** Fever / hyperthermia thresholds the Pi evaluates against (see thermal-pi/config.py). */
const FEVER_C = 40.0;
const HYPERTHERMIA_C = 41.0;

export interface AlertDetailProps {
  /** The raw PocketBase alert record. */
  alert: Record<string, unknown> | null;
  visible: boolean;
  onClose: () => void;
}

/**
 * Plain-language cause for an alert. Derived from the stored type/severity —
 * never invented, and always falls back to the raw stored message.
 */
export function explainAlertCause(alert: Record<string, unknown>): string {
  const type = String(alert.type ?? '').toUpperCase();
  const severity = String(alert.severity ?? '').toLowerCase();
  const temp = typeof alert.bodyTemp === 'number' ? alert.bodyTemp : undefined;

  if (type.includes('HYPERTHERMIA')) {
    return (
      `Body temperature reached the hyperthermia threshold (${HYPERTHERMIA_C.toFixed(1)} °C)` +
      (temp !== undefined ? ` — measured ${temp.toFixed(1)} °C` : '') +
      `. This needs a veterinarian now: cool the animal and check for heat stress, fever or infection.`
    );
  }
  if (type.includes('FEVER')) {
    return (
      `Body temperature rose above the fever threshold (${FEVER_C.toFixed(1)} °C)` +
      (temp !== undefined ? ` — measured ${temp.toFixed(1)} °C` : '') +
      `. Watch the animal and re-check; escalate if it keeps climbing or the pig is off its feed.`
    );
  }
  if (type.includes('COUGH')) {
    return 'The acoustic classifier detected a cough-like sound pattern on the microphone channel.';
  }
  if (severity === 'critical') {
    return 'A critical condition was reported by the device. Check the capture and the readings below.';
  }
  if (severity === 'warning') {
    return 'The device reported a condition worth reviewing. Check the readings below.';
  }
  return 'Recorded by the device. The stored message below is the original report.';
}

export function AlertDetail({ alert, visible, onClose }: AlertDetailProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [context, setContext] = useState<Record<string, unknown>[]>([]);
  const [contextState, setContextState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const frame = useMemo(() => {
    const f = alert?.frame;
    return typeof f === 'string' && f.trim() ? f : '';
  }, [alert]);

  const timestamp = useMemo(() => {
    const t = alert?.timestamp;
    if (typeof t !== 'number') return null;
    // The bridge writes epoch ms; seeds may write epoch seconds.
    return t > 1e12 ? t : t * 1000;
  }, [alert]);

  const deviceId = useMemo(() => String(alert?.deviceId ?? ''), [alert]);

  // Nearby context: the device readings around the alert moment.
  useEffect(() => {
    if (!visible || !alert) return;
    let cancelled = false;
    (async () => {
      // Inside the async body (not synchronously in the effect) so this does
      // not trigger a cascading render.
      setContextState('loading');
      try {
        const { items } = await pbList('telemetry', { sort: '-timestamp', perPage: 200 });
        if (cancelled) return;
        const rows = items.filter((r) => {
          if (deviceId && String(r.deviceId ?? '') !== deviceId) return false;
          const t = r.timestamp;
          if (typeof t !== 'number' || timestamp === null) return false;
          const ms = t > 1e12 ? t : t * 1000;
          return Math.abs(ms - timestamp) <= 30 * 60 * 1000;
        });
        if (cancelled) return;
        setContext(rows.slice(0, 12));
        setContextState('ready');
      } catch {
        if (!cancelled) setContextState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [visible, alert, deviceId, timestamp]);

  if (!alert) return null;

  const cause = explainAlertCause(alert);
  const message = String(alert.message ?? '');
  const type = String(alert.type ?? '');

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.background,
            borderTopLeftRadius: radius.lg ?? 20,
            borderTopRightRadius: radius.lg ?? 20,
            maxHeight: '92%',
            paddingBottom: spacing.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: colors.divider,
            }}
          >
            <Text style={[typography.h2, { color: colors.textPrimary }]}>What happened</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close alert details"
              accessibilityHint="Closes the alert detail panel"
              style={({ pressed }) => ({
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: radius.sm,
                backgroundColor: pressed ? colors.surfaceAlt : colors.surface,
              })}
            >
              <Text style={[typography.body, { color: colors.textPrimary, fontSize: 16 }]}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: spacing.md }}>
            {/* Cause — the headline the user asked for. */}
            <View
              style={{
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.divider,
                padding: spacing.md,
                marginBottom: spacing.md,
              }}
            >
              <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16 }]}>
                CAUSE
              </Text>
              <Text
                style={[
                  typography.body,
                  { color: colors.textPrimary, fontSize: 17, lineHeight: 25, marginTop: 6 },
                ]}
              >
                {cause}
              </Text>
              {message ? (
                <Text
                  style={[
                    typography.bodySmall,
                    { color: colors.textSecondary, fontSize: 16, marginTop: 10, lineHeight: 22 },
                  ]}
                >
                  Device report: {message}
                </Text>
              ) : null}
              <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16, marginTop: 10 }]}>
                {type ? `Type: ${type}` : ''}
                {deviceId ? ` · Device: ${deviceId}` : ''}
                {timestamp ? ` · ${new Date(timestamp).toLocaleString()}` : ''}
              </Text>
            </View>

            {/* Capture frame */}
            <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16, marginBottom: 6 }]}>
              CAPTURE FRAME
            </Text>
            {frame ? (
              <Image
                source={{ uri: frame }}
                style={{
                  width: '100%',
                  height: 220,
                  borderRadius: radius.md,
                  backgroundColor: colors.surfaceAlt,
                }}
                resizeMode="cover"
                accessibilityLabel="Camera capture frame at the time of the alert"
              />
            ) : (
              <View
                style={{
                  padding: spacing.md,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>
                  No camera frame was captured for this alert.
                </Text>
              </View>
            )}

            {/* Device context around the alert */}
            <Text
              style={[
                typography.bodySmall,
                { color: colors.textSecondary, fontSize: 16, marginTop: spacing.md, marginBottom: 6 },
              ]}
            >
              DEVICE READINGS AROUND THIS TIME
            </Text>
            {contextState === 'loading' ? (
              <ActivityIndicator color={colors.accent} />
            ) : contextState === 'error' ? (
              <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>
                Could not load the surrounding readings.
              </Text>
            ) : context.length === 0 ? (
              <Text style={[typography.bodySmall, { color: colors.textMuted, fontSize: 16 }]}>
                No stored readings within 30 minutes of this alert.
              </Text>
            ) : (
              context.map((row, i) => {
                const t = row.timestamp;
                const ms = typeof t === 'number' ? (t > 1e12 ? t : t * 1000) : null;
                const center = row.center ?? row.bodyTemp ?? row.temperature;
                const verdict = row.verdict;
                return (
                  <View
                    key={`${String(row.id ?? i)}`}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 6,
                    }}
                  >
                    <Text style={[typography.bodySmall, { color: colors.textPrimary, fontSize: 16 }]}>
                      {ms ? new Date(ms).toLocaleTimeString() : ''}
                      {typeof center === 'number' ? ` · ${Number(center).toFixed(2)} °C` : ''}
                    </Text>
                    {verdict ? (
                      <Text style={[typography.bodySmall, { color: colors.textSecondary, fontSize: 16 }]}>
                        {String(verdict)}
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
