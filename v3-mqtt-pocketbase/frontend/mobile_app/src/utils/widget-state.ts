/**
 * Pure builder for the native Android home-screen widget cache.
 *
 * The widget is a glanceable surface, not another clinical dashboard. It must
 * never turn a barn SCENE centre into a pig-temperature verdict:
 *
 *   - `center` is a scene reading and is labelled "Scene centre";
 *   - only an explicit reported `healthStatus`, `status` or `verdict` token may
 *     set normal/watch/alert;
 *   - a device-REPORTED `temperature` may carry only the legacy display band,
 *     and that band is always labelled legacy;
 *   - an alert may drive the headline only while it is current. Older alerts
 *     stay visible as stored history but never masquerade as current.
 *
 * This module has no React, network or filesystem dependency so its honesty
 * rules can be tested under the repository's plain tsx runner.
 */

import { classifyKind, classifySeverity, mapAlert } from './alert-record';
import {
  AGING_MS,
  FUTURE_TOLERANCE_MS,
  freshnessBand,
  legacyDisplayBand,
  readDeviceValue,
  type FreshnessBand,
  type TelemetryFrame,
} from './home-telemetry';
import { telemetryTime } from './telemetry-time';

export type WidgetLevel = 'normal' | 'watch' | 'alert' | 'unknown';
export type WidgetTheme = 'light' | 'dark';
export type WidgetStatusSource =
  | 'healthStatus'
  | 'status'
  | 'verdict'
  | 'reportedTemperature'
  | 'alert'
  | 'none';

export interface WidgetStatus {
  level: WidgetLevel;
  label: string;
  source: WidgetStatusSource;
}

export interface WidgetReading {
  kind: 'temperature' | 'scene' | 'ambient' | 'none';
  value: number | null;
  label: string;
}

export interface WidgetAlert {
  id: string;
  level: 'alert' | 'watch' | 'info';
  label: string;
  kind: 'thermal' | 'sound' | 'system' | 'unknown';
  typeToken: string;
  message: string;
  /** True only while the alert is inside the same freshness window as telemetry. */
  current: boolean;
}

export interface WidgetState {
  v: 1;
  theme: WidgetTheme;
  deviceId: string;
  deviceLabel: string;
  status: WidgetStatus;
  reading: WidgetReading;
  freshness: FreshnessBand;
  /** Device acquisition time in ms, when the telemetry record carries one. */
  sampleAt: number | null;
  alert: WidgetAlert | null;
}

export interface WidgetStateInput {
  /**
   * PocketBase timestamps are normally ISO strings, while local caches and
   * older records may carry epoch milliseconds. Override the base string-only
   * timestamp declaration without widening every TelemetryFrame field.
   */
  frame?: (Omit<TelemetryFrame, 'timestamp'> & { timestamp?: string | number }) | null;
  alert?: Record<string, unknown> | null;
  now: number;
  theme: WidgetTheme;
  deviceId?: string;
  deviceLabel?: string;
}

const STATUS_TOKENS: Record<string, { level: Exclude<WidgetLevel, 'unknown'>; label: string }> = {
  NORMAL: { level: 'normal', label: 'Normal' },
  HEALTHY: { level: 'normal', label: 'Healthy' },
  OK: { level: 'normal', label: 'OK' },
  CLEAR: { level: 'normal', label: 'Clear' },
  WATCH: { level: 'watch', label: 'Watch' },
  WARNING: { level: 'watch', label: 'Warning' },
  ELEVATED: { level: 'watch', label: 'Elevated' },
  MEDIUM: { level: 'watch', label: 'Medium' },
  CRITICAL: { level: 'alert', label: 'Critical' },
  ALERT: { level: 'alert', label: 'Alert' },
  HIGH: { level: 'alert', label: 'High' },
  DANGER: { level: 'alert', label: 'Danger' },
  SEVERE: { level: 'alert', label: 'Severe' },
  FEVER: { level: 'alert', label: 'Fever' },
  HYPERTHERMIA: { level: 'alert', label: 'Hyperthermia' },
};

function token(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Find an explicit device-reported status. Unrecognised tokens stay visible and
 * unknown; they are never promoted to healthy, warning or critical.
 */
function explicitStatus(frame: WidgetStateInput['frame']): WidgetStatus | null {
  if (!frame) return null;
  let unknownCandidate: WidgetStatus | null = null;
  for (const source of ['healthStatus', 'status', 'verdict'] as const) {
    const raw = token(frame[source]);
    if (!raw) continue;
    const normalized = raw.toUpperCase();
    const mapped = STATUS_TOKENS[normalized];
    if (mapped) {
      return { level: mapped.level, label: `Reported: ${mapped.label}`, source };
    }
    if (!unknownCandidate) {
      unknownCandidate = { level: 'unknown', label: `Reported: ${raw}`, source };
    }
  }
  return unknownCandidate;
}

function readingFor(frame: WidgetStateInput['frame']): WidgetReading {
  if (!frame) return { kind: 'none', value: null, label: 'No reading' };
  const reading = readDeviceValue(frame as TelemetryFrame);
  if (reading.kind === 'temperature') {
    return { kind: 'temperature', value: reading.value, label: 'Reported temperature' };
  }
  if (reading.kind === 'scene') {
    return { kind: 'scene', value: reading.value, label: 'Scene centre' };
  }
  if (reading.kind === 'ambient') {
    return { kind: 'ambient', value: reading.value, label: 'Ambient' };
  }
  return { kind: 'none', value: null, label: 'No reading' };
}

function alertTime(record: Record<string, unknown>): number {
  return telemetryTime(record.timestamp ?? record.created);
}

function alertIsCurrent(record: Record<string, unknown>, now: number): boolean {
  const time = alertTime(record);
  if (!Number.isFinite(time)) return false;
  const age = now - time;
  return age >= -FUTURE_TOLERANCE_MS && age <= AGING_MS;
}

/** Build the JSON contract consumed by the Kotlin AppWidgetProvider. */
export function buildWidgetState(input: WidgetStateInput): WidgetState {
  const frame = input.frame ?? null;
  const reading = readingFor(frame);
  const freshness = frame
    ? freshnessBand(frame as TelemetryFrame, input.now)
    : 'unknown';

  let alert: WidgetAlert | null = null;
  if (input.alert) {
    const id = token(input.alert.id) || 'alert';
    const mapped = mapAlert(id, input.alert);
    const current = alertIsCurrent(input.alert, input.now);
    alert = {
      id: mapped.id,
      level: mapped.status,
      label: mapped.label,
      kind: mapped.kind,
      typeToken: mapped.typeToken,
      message: mapped.message,
      current,
    };
  }

  let status = explicitStatus(frame);
  if (!status && reading.kind === 'temperature' && reading.value !== null) {
    const band = legacyDisplayBand(reading.value);
    if (band) {
      status = {
        level: band,
        label: `Reported temperature: ${band} legacy band`,
        source: 'reportedTemperature',
      };
    }
  }
  if (!status && alert?.current && alert.level !== 'info') {
    status = {
      level: alert.level,
      label: `Latest alert: ${alert.label}`,
      source: 'alert',
    };
  }
  if (!status) {
    status = { level: 'unknown', label: 'No reported device status', source: 'none' };
  }

  // `frame.id` is the PocketBase RECORD id, not a device identity, so it is
  // never used here: the device identity is the frame's `deviceId`, else the
  // caller-selected identity.
  const deviceId = token(frame?.deviceId) || token(input.deviceId);
  const deviceLabel = token(input.deviceLabel) || deviceId || 'PigPulse box';

  // telemetryTime() returns NaN for an unusable stamp; `sampleAt` is
  // `number | null`, so an invalid stamp must degrade to null rather than leak
  // a NaN that only reads as "absent" after JSON serialisation.
  const acquired = frame ? telemetryTime(frame.timestamp) : NaN;

  return {
    v: 1,
    theme: input.theme,
    deviceId,
    deviceLabel,
    status,
    reading,
    freshness,
    sampleAt: Number.isFinite(acquired) ? acquired : null,
    alert,
  };
}

/**
 * Stable material-change signature used to suppress cache-file write storms.
 * The telemetry timestamp is deliberately excluded: a new sample with the same
 * visible reading/status does not need a new widget file.
 */
export function widgetStateSignature(state: WidgetState): string {
  const reading =
    state.reading.kind === 'scene' && state.reading.value !== null
      ? {
          ...state.reading,
          value: Math.round(state.reading.value * 10) / 10,
        }
      : state.reading;

  return JSON.stringify({
    theme: state.theme,
    deviceId: state.deviceId,
    deviceLabel: state.deviceLabel,
    status: state.status,
    reading,
    freshness: state.freshness,
    alert: state.alert
      ? {
          id: state.alert.id,
          level: state.alert.level,
          label: state.alert.label,
          kind: state.alert.kind,
          typeToken: state.alert.typeToken,
          message: state.alert.message,
          current: state.alert.current,
        }
      : null,
  });
}

// Re-export the shared classifiers for consumers that need to explain why an
// explicit token was retained without re-implementing the same rules.
export { classifyKind, classifySeverity };
