/**
 * PigPulse v3 — PocketBase data layer (drop-in replacement for src/utils/firebase.ts API)
 *
 * Mirrors the v2 firebase.ts subscriber signatures so the ported deployed screens
 * work unchanged: subscribeRoster / enrollPig / subscribeAlerts / subscribeSensors /
 * subscribeTelemetry all talk to PocketBase (self-hosted, no Firebase).
 *
 * Collections (v3 PB):
 *   users, telemetry, alerts, devices, pigs
 */

import {
  pbList,
  pbCreate,
  pbSubscribeRealtime,
  PB_URL,
} from './pocketbase';
import type { SensorReading as LiveSensorReading, SensorStatus } from '../data/mockSensors';
import { toDeviceFields, hasReading, UNKNOWN_READING } from './device-record';
import { cacheGet, cacheSet } from './storage-cache';

export type SensorReading = Record<string, unknown> & { id?: string; name?: string; temp?: number };

/**
 * Maps a PB `devices` row to the v2 LiveSensor shape callers were built against.
 *
 * The returned object is a `LiveSensorReading` (no central type change) with two
 * optional metadata fields added by intersection so the Settings screen can show
 * real firmware/RSSI without a second read or a fabricated value.
 */
function toLiveSensor(device: Record<string, unknown>): LiveSensorReading & { firmware?: string; rssi?: number } {
  const fields = toDeviceFields(device, 'sensor');
  const type = String(device.type || '').toLowerCase().includes('mic')
    || /mic|s3-mic|acoustic/i.test(fields.name)
    ? 'acoustic'
    : 'thermal';
  // Unknown reading is explicit (NaN), never a normal-looking 0.
  const value =
    typeof device.lastValue === 'number' ? device.lastValue
    : typeof device.temperature === 'number' ? device.temperature
    : typeof device.temp === 'number' ? device.temp
    : UNKNOWN_READING;
  // No fabricated "now": an unknown acquisition time stays empty, and the
  // Settings screen treats it as offline rather than freshly online.
  const lastUpdated = fields.lastSeenRaw == null ? '' : String(fields.lastSeenRaw);
  // Status comes only from an explicit device status. The old
  // `thermal && value > maxRange → danger` heuristic was removed because a
  // thermal *scene* surface reading above range is not a fever; any danger
  // must come from the device/classifier status to avoid inventing illness.
  let status: SensorStatus = 'normal';
  const rawStatus = String(device.status || '');
  if (rawStatus === 'warning' || rawStatus === 'danger') status = rawStatus;
  return {
    id: fields.id,
    type,
    label: fields.name,
    icon: String(device.icon || (type === 'acoustic' ? '🎤' : '📡')),
    value: hasReading(value) ? value : UNKNOWN_READING,
    unit: String(device.unit || (type === 'acoustic' ? '' : '°C')),
    status,
    lastUpdated,
    minRange: Number(device.minRange ?? 37.5),
    maxRange: Number(device.maxRange ?? 40),
    ...(fields.firmware !== null ? { firmware: fields.firmware } : {}),
    ...(fields.rssiDbm !== null ? { rssi: fields.rssiDbm } : {}),
  };
}

/**
 * subscribeRoster — live roster from the `pigs` collection.
 * Emits the full list on subscribe + on any realtime change.
 */
export function subscribeRoster(callback: (roster: Record<string, unknown>[]) => void) {
  let cancelled = false;

  const emit = () => {
    pbList('pigs', { sort: '-created', perPage: 200 })
      .then(({ items }) => {
        if (!cancelled) callback(items);
      })
      .catch(() => {
        if (!cancelled) callback([]);
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('pigs', () => emit());
  return () => {
    cancelled = true;
    unsub();
  };
}

/** enrollPig — create a pig record in PocketBase (schema: pigId, name, healthStatus, tags). */
export async function enrollPig(name: string): Promise<Record<string, unknown>> {
  return pbCreate('pigs', {
    pigId: `pig-${Date.now().toString(36)}`,
    name,
    healthStatus: 'NORMAL',
    tags: [],
  });
}

/**
 * subscribeAlerts — live alerts from the `alerts` collection.
 *
 * Optional `onError`: screens that can show an honest error state pass it and
 * receive the failure instead of an empty list. Existing callers pass only the
 * first argument, so they keep the legacy `callback([])` behavior unchanged.
 */
export function subscribeAlerts(
  callback: (alerts: Record<string, unknown>[]) => void,
  onError?: (error: unknown) => void
) {
  let cancelled = false;
  // Monotonic per-subscription request generation. Realtime events can start a
  // new read while an older one is still in flight; if the older read settles
  // last it must NOT overwrite the newer result — on success OR on failure.
  let generation = 0;

  const emit = () => {
    const request = ++generation;
    pbList('alerts', { sort: '-timestamp', perPage: 50 })
      .then(({ items }) => {
        if (cancelled || request !== generation) return;
        callback(items);
      })
      .catch((error) => {
        if (cancelled || request !== generation) return;
        if (onError) onError(error);
        else callback([]);
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('alerts', () => emit());
  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * subscribeSensors — live devices/sensor nodes from the `devices` collection.
 *
 * Optional `onError`: consistency with `subscribeAlerts`, so the Settings
 * screen can show an honest error state. Callers that omit it keep the legacy
 * `callback([])` behavior.
 */
export function subscribeSensors(
  callback: (sensors: LiveSensorReading[]) => void,
  onError?: (error: unknown) => void
) {
  let cancelled = false;
  // Same monotonic generation guard as subscribeAlerts: a superseded read must
  // never overwrite a newer result, whether it succeeds or fails.
  let generation = 0;

  const emit = () => {
    const request = ++generation;
    pbList('devices', { sort: '-created', perPage: 200 })
      .then(({ items }) => {
        if (cancelled || request !== generation) return;
        callback(items.map(toLiveSensor));
      })
      .catch((error) => {
        if (cancelled || request !== generation) return;
        if (onError) onError(error);
        else callback([]);
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('devices', () => emit());
  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * subscribeDeviceNames — deviceId → devices.name map.
 * Lets screens label telemetry rows with the name set in PocketBase
 * (each `devices` row) instead of the raw deviceId. Emits {} when the
 * devices list can't be read.
 */
export function subscribeDeviceNames(callback: (names: Record<string, string>) => void) {
  let cancelled = false;

  const toNames = (items: Record<string, unknown>[]): Record<string, string> => {
    const names: Record<string, string> = {};
    for (const item of items) {
      const id = String(item.deviceId || item.id || '');
      if (id) names[id] = String(item.name || id);
    }
    return names;
  };

  const emit = () => {
    pbList('devices', { perPage: 200 })
      .then(({ items }) => {
        if (cancelled) return;
        void cacheSet('devices', items);
        callback(toNames(items));
      })
      .catch(() => {
        if (cancelled) return;
        // Offline: keep the labels we already know. Blanking them would make
        // every device row fall back to a raw deviceId, which is worse than
        // a slightly stale name.
        void cacheGet<Record<string, unknown>[]>('devices').then((hit) => {
          if (cancelled) return;
          callback(hit && Array.isArray(hit.v) ? toNames(hit.v) : {});
        });
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('devices', () => emit());
  return () => {
    cancelled = true;
    unsub();
  };
}

/** subscribeTelemetry — latest telemetry frame for a device. */
export function subscribeTelemetry(
  deviceId: string,
  callback: (telemetry: Record<string, unknown> | null) => void
) {
  let cancelled = false;

  const emit = () => {
    pbList('telemetry', { filter: `deviceId='${deviceId}'`, sort: '-timestamp', perPage: 1 })
      .then(({ items }) => {
        if (!cancelled) callback((items[0] as Record<string, unknown>) || null);
      })
      .catch(() => {
        if (!cancelled) callback(null);
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('telemetry', (e) => {
    if (!cancelled && (e.record as any).deviceId === deviceId) emit();
  });
  return () => {
    cancelled = true;
    unsub();
  };
}

/** Kept for callers that reference the old firebase helper names. */
export const getUserPath = () => null;
export const sensorsRef = () => null;
export const alertsRef = () => null;
export const telemetryRef = () => null;
export const commandsRef = () => null;
export const rosterRef = () => null;

export { PB_URL };