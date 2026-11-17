/**
 * Pure helpers for keeping the native Android widget in sync with PocketBase.
 *
 * Selection is based on the record's device acquisition time, normalised by
 * telemetryTime(), rather than PocketBase's server-side sort order.
 */

import { telemetryTime } from './telemetry-time';

export type WidgetSyncRecord = Record<string, unknown>;

export interface WidgetDeviceIdentity {
  deviceId: string;
  deviceLabel: string;
}

/** Minimal filesystem operations needed for durable widget-cache replacement. */
export interface WidgetStateFileAdapter {
  writeFile(path: string, contents: string): Promise<void>;
  moveFile(source: string, destination: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A widget device identity must be a bounded, quote-free token so it can be
 * embedded in a PocketBase filter (`deviceId='<id>'`) without escaping. One
 * leading alphanumeric, then up to 63 of `.`, `_`, `-` or alphanumeric: 1..64
 * characters total. Spaces, quotes and control characters are rejected.
 */
export const WIDGET_DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** True when `value` trims to a usable, filter-safe widget device identity. */
export function isValidWidgetDeviceId(value: unknown): boolean {
  return typeof value === 'string' && WIDGET_DEVICE_ID_PATTERN.test(value.trim());
}

export interface SelectedWidgetDevice {
  deviceId: string;
  /** Friendly label from the record (`name` / `deviceName` / `label`), or ''. */
  label: string;
  record: WidgetSyncRecord;
}

function widgetDeviceLabel(record: WidgetSyncRecord): string {
  return text(record.name) || text(record.deviceName) || text(record.label);
}

/**
 * Select exactly one widget device, deterministically.
 *
 * Ordering is the record's device acquisition time (`lastSeen`), normalised by
 * telemetryTime() so mixed second/millisecond units compare correctly. The
 * newest usable record wins; equal times break by ascending `deviceId` so the
 * choice is stable regardless of server sort order. Untimed records rank after
 * every timed one. Records without a valid device identity are never selected.
 */
export function selectWidgetDevice(
  records: readonly WidgetSyncRecord[],
): SelectedWidgetDevice | null {
  let selected: { record: WidgetSyncRecord; deviceId: string; lastSeen: number } | null = null;

  for (const record of records) {
    const deviceId = text(record.deviceId);
    if (!isValidWidgetDeviceId(deviceId)) continue;

    const seenAt = telemetryTime(record.lastSeen);
    const ranked = Number.isFinite(seenAt) ? seenAt : Number.NEGATIVE_INFINITY;

    if (selected === null) {
      selected = { record, deviceId, lastSeen: ranked };
      continue;
    }
    if (ranked > selected.lastSeen) {
      selected = { record, deviceId, lastSeen: ranked };
    } else if (ranked === selected.lastSeen) {
      if (deviceId < selected.deviceId) {
        selected = { record, deviceId, lastSeen: ranked };
      } else if (deviceId === selected.deviceId) {
        // Duplicate logical device IDs are possible. The PocketBase record ID
        // is the final deterministic fallback, never the device identity.
        if (text(record.id) > text(selected.record.id)) {
          selected = { record, deviceId, lastSeen: ranked };
        }
      }
    }
  }

  if (selected === null) return null;
  return {
    deviceId: selected.deviceId,
    label: widgetDeviceLabel(selected.record),
    record: selected.record,
  };
}

/**
 * Deterministic tie-break for rows that share the same normalized device time.
 *
 * `created` is PocketBase's record ARRIVAL time, not the device acquisition
 * time, so it only orders rows that already carry an equal device timestamp:
 * the later arrival wins, then the larger record `id`. Returns > 0 when `a`
 * should be preferred over `b`, so equal-time selection is stable regardless of
 * the server's sort order.
 */
function preferOnTie(a: WidgetSyncRecord, b: WidgetSyncRecord): number {
  const aCreated = telemetryTime(a.created);
  const bCreated = telemetryTime(b.created);
  const aTimed = Number.isFinite(aCreated);
  const bTimed = Number.isFinite(bCreated);
  if (aTimed && bTimed) {
    if (aCreated !== bCreated) return aCreated - bCreated;
  } else if (aTimed !== bTimed) {
    return aTimed ? 1 : -1;
  }

  const aId = text(a.id);
  const bId = text(b.id);
  if (aId === bId) return 0;
  return aId > bId ? 1 : -1;
}

/**
 * Select the newest telemetry frame with a usable acquisition timestamp.
 *
 * When `expectedDeviceId` is provided, rows whose trimmed `deviceId` differs —
 * and rows without a device identity — are ignored. The caller already scopes
 * the PocketBase query by device; this local check stops a widened or malformed
 * response from letting another device drive the widget. Omitting the argument
 * preserves the previous unscoped behavior for callers that do not scope.
 */
export function selectNewestTelemetry(
  records: readonly WidgetSyncRecord[],
  expectedDeviceId?: string,
): WidgetSyncRecord | null {
  const scoped = expectedDeviceId !== undefined;
  const wantedDeviceId = typeof expectedDeviceId === 'string' ? expectedDeviceId.trim() : '';

  let selected: WidgetSyncRecord | null = null;
  let selectedAt = NaN;

  for (const record of records) {
    if (scoped) {
      const recordDeviceId = text(record.deviceId);
      if (recordDeviceId !== wantedDeviceId || !recordDeviceId) continue;
    }
    const sampledAt = telemetryTime(record.timestamp);
    if (!Number.isFinite(sampledAt)) continue;
    if (
      !selected ||
      sampledAt > selectedAt ||
      (sampledAt === selectedAt && preferOnTie(record, selected) > 0)
    ) {
      selected = record;
      selectedAt = sampledAt;
    }
  }

  return selected;
}

/**
 * Resolve the device identity shown by the widget.
 *
 * When a poll has no frame, the previous identity is retained so the widget
 * does not flash a generic label. A frame for a different device replaces the
 * identity instead of borrowing the previous device's friendly label.
 */
export function resolveWidgetIdentity(
  frame: WidgetSyncRecord | null,
  previous: WidgetDeviceIdentity | null = null,
): WidgetDeviceIdentity {
  const frameDeviceId = text(frame?.deviceId);
  const previousDeviceId = text(previous?.deviceId);
  const deviceId = frameDeviceId || previousDeviceId;

  const frameLabel = text(frame?.deviceName) || text(frame?.name) || text(frame?.label);
  const mayReusePreviousLabel = !frameDeviceId || frameDeviceId === previousDeviceId;
  const deviceLabel =
    frameLabel ||
    (mayReusePreviousLabel ? text(previous?.deviceLabel) : '') ||
    deviceId ||
    'PigPulse box';

  return { deviceId, deviceLabel };
}

/**
 * Select the newest alert that belongs to one device.
 *
 * The caller also scopes the PocketBase query by device. This second local
 * check prevents a malformed or widened server response from leaking another
 * device's alert into the widget.
 */
export function selectNewestAlert(
  records: readonly WidgetSyncRecord[],
  deviceId: string,
): WidgetSyncRecord | null {
  const wantedDeviceId = typeof deviceId === 'string' ? deviceId.trim() : '';
  if (!wantedDeviceId) return null;

  let selected: WidgetSyncRecord | null = null;
  let selectedAt = NaN;

  for (const record of records) {
    const recordDeviceId = typeof record.deviceId === 'string' ? record.deviceId.trim() : '';
    if (recordDeviceId !== wantedDeviceId) continue;

    const timestampAt = telemetryTime(record.timestamp);
    const recordedAt = Number.isFinite(timestampAt)
      ? timestampAt
      : telemetryTime(record.created);
    if (!Number.isFinite(recordedAt)) continue;
    if (
      !selected ||
      recordedAt > selectedAt ||
      (recordedAt === selectedAt && preferOnTie(record, selected) > 0)
    ) {
      selected = record;
      selectedAt = recordedAt;
    }
  }

  return selected;
}

/**
 * Replace the widget cache without exposing a partially-written file.
 *
 * The replacement is written to a sibling temporary file and then moved over
 * the canonical target. The target is never deleted first, so a failed write
 * or move leaves the last valid JSON in place.
 */
export async function replaceWidgetStateFile(
  files: WidgetStateFileAdapter,
  targetPath: string,
  contents: string,
): Promise<void> {
  const temporaryPath = `${targetPath}.tmp`;

  try {
    await files.writeFile(temporaryPath, contents);
    await files.moveFile(temporaryPath, targetPath);
  } catch (error) {
    try {
      await files.deleteFile(temporaryPath);
    } catch {
      // Preserve the replacement failure; the last valid target is unchanged.
    }
    throw error;
  }
}
