/**
 * Maintenance notice — say plainly what is wrong and who has to fix it.
 *
 * The brief from the field: when something is not right, the app must not go
 * quiet or show a cheerful green tick. It must say, in plain language:
 *
 *   - WHAT is not working,
 *   - WHAT the farmer can still trust (and what they cannot),
 *   - WHAT the farmer can do (often: nothing — it is hardware or a wiring job),
 *   - and that the MAINTAINER has to fix it.
 *
 * Nothing here invents a diagnosis. Every notice is derived from a real,
 * observed state (no live frame, no stored rows, transport error, no device
 * reporting) and the copy never claims more than we measured.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';
import { useTheme } from '../theme';

export interface MaintenanceFault {
  /** Short headline. */
  title: string;
  /** What this means for the data on screen. */
  detail: string;
  /** What the farmer can do right now. */
  action: string;
  /** 'warn' = degraded, 'critical' = the box is not reporting. */
  tone?: 'warn' | 'critical';
}

export interface MaintenanceNoticeProps {
  fault: MaintenanceFault;
  /** Diagnostics a farmer can copy into a message to the maintainer. */
  diagnostics?: string;
}

export function MaintenanceNotice({ fault, diagnostics }: MaintenanceNoticeProps) {
  const { colors, spacing, radius, typography } = useTheme();
  const [copied, setCopied] = useState(false);

  const accent = fault.tone === 'critical' ? colors.alert : colors.watch;

  const shareDiagnostics = async () => {
    if (!diagnostics) return;
    try {
      // React Native's built-in Share: no extra dependency, and the farmer can
      // send the details straight to the maintainer over WhatsApp/Telegram.
      if (Platform.OS === 'web') {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(diagnostics);
        } else if (navigator.share) {
          await navigator.share({ title: 'PigPulse diagnostics', text: diagnostics });
        }
      } else {
        await Share.share({ title: 'PigPulse diagnostics', message: diagnostics });
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: accent,
        padding: spacing.md,
        marginTop: spacing.sm,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: accent,
            marginRight: spacing.sm,
          }}
        />
        <Text style={[typography.body, { color: colors.textPrimary, fontSize: 16, fontWeight: '700' }]}>
          {fault.title}
        </Text>
      </View>

      <Text
        style={[
          typography.bodySmall,
          { color: colors.textSecondary, fontSize: 16, marginTop: spacing.xs, lineHeight: 22 },
        ]}
      >
        {fault.detail}
      </Text>

      <Text
        style={[
          typography.bodySmall,
          { color: colors.textPrimary, fontSize: 16, marginTop: spacing.xs, lineHeight: 22 },
        ]}
      >
        {fault.action}
      </Text>

      <Text
        style={[
          typography.bodySmall,
          { color: colors.textMuted, fontSize: 16, marginTop: spacing.sm, lineHeight: 21 },
        ]}
      >
        This is a fault on the box (hardware, wiring or software) — not something
        you did. If it does not clear on its own, please tell the maintainer so
        it can be repaired.
      </Text>

      {diagnostics ? (
        <Pressable
          onPress={shareDiagnostics}
          accessibilityRole="button"
          accessibilityLabel="Send details to the maintainer"
          accessibilityHint="Opens a share sheet with the technical details so you can send them to the maintainer"
          style={({ pressed }) => ({
            marginTop: spacing.sm,
            alignSelf: 'flex-start',
            paddingHorizontal: 14,
            paddingVertical: 10,
            minHeight: 44,
            justifyContent: 'center',
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.divider,
            backgroundColor: pressed ? colors.surfaceAlt : 'transparent',
          })}
        >
          <Text style={[typography.bodySmall, { color: colors.accent, fontSize: 16 }]}>
            {copied ? 'Shared ✓' : 'Send details to the maintainer'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Turn the observed state into at most ONE notice, most specific first.
 * Returns null when everything that was measured looks healthy.
 */
export function describeFaults(input: {
  /** 'error' means the transport failed outright. */
  connectionStatus: string;
  /** A live thermal frame is arriving. */
  thermalLive: boolean;
  /** Stored thermal rows are available. */
  hasStoredThermal: boolean;
  /** Number of devices currently reporting. */
  deviceCount: number;
  /** Base URL the app is talking to (may contain a host only, no secrets). */
  pbUrl?: string;
}): MaintenanceFault | null {
  const { connectionStatus, thermalLive, hasStoredThermal, deviceCount } = input;

  if (connectionStatus === 'error') {
    return {
      title: 'Cannot reach the box',
      detail:
        'The app cannot reach the PigPulse device, so the readings below may be old. ' +
        'Nothing is wrong with your pigs — the device is not answering.',
      action:
        'Check that the phone is on the "PigPulse" Wi-Fi, then pull down to refresh. ' +
        'If the phone is on another Wi-Fi, the box is out of range.',
      tone: 'critical',
    };
  }

  if (!thermalLive && !hasStoredThermal) {
    return {
      title: 'No readings from the thermal camera',
      detail:
        'The device is reachable but the thermal camera is not reporting any ' +
        'temperature. The pigs are fine — the sensor or its cable is not.',
      action:
        'Nothing to do here. This one is a job for the maintainer: the sensor or ' +
        'its cable needs checking.',
      tone: 'critical',
    };
  }

  if (deviceCount === 0) {
    return {
      title: 'No devices reporting',
      detail:
        'The box is up but no sensor (camera, microphone or tag) is reporting in. ' +
        'A device may have lost power or dropped off the Wi-Fi.',
      action:
        'Check that the sensors have power. If they do and this stays, tell the ' +
        'maintainer — the box may need a restart.',
      tone: 'warn',
    };
  }

  return null;
}

/** A compact, copyable diagnostic line for the maintainer. */
export function diagnosticsLine(input: {
  pbUrl?: string;
  connectionStatus: string;
  thermalLive: boolean;
  deviceCount: number;
  at?: number;
}): string {
  const { pbUrl, connectionStatus, thermalLive, deviceCount, at } = input;
  return [
    'PigPulse diagnostics',
    `when: ${new Date(at ?? Date.now()).toISOString()}`,
    `box: ${pbUrl || 'not set'}`,
    `transport: ${connectionStatus}`,
    `thermal live: ${thermalLive ? 'yes' : 'no'}`,
    `devices reporting: ${deviceCount}`,
  ].join('\n');
}
