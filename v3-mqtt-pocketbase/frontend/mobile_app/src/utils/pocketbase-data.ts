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

export type SensorReading = Record<string, unknown> & { id?: string; name?: string; temp?: number };

/** Maps a PB `devices` row to the v2 LiveSensor shape callers were built against. */
function toLiveSensor(device: Record<string, unknown>): LiveSensorReading {
  const id = String(device.id || device.deviceId || 'sensor');
  const name = String(device.name || device.deviceId || id);
  const value =
    typeof device.lastValue === 'number' ? device.lastValue
    : typeof device.temperature === 'number' ? device.temperature
    : typeof device.temp === 'number' ? device.temp
    : 0;
  const lastUpdated = String(device.lastUpdated || device.lastSeen || new Date().toISOString());
  let status: SensorStatus = 'normal';
  const rawStatus = String(device.status || '');
  if (rawStatus === 'warning' || rawStatus === 'danger') status = rawStatus;
  else if (value > Number(device.maxRange ?? 40)) status = 'danger';
  return {
    id,
    type: 'thermal',
    label: name,
    icon: String(device.icon || '📡'),
    value,
    unit: String(device.unit || '°C'),
    status,
    lastUpdated,
    minRange: Number(device.minRange ?? 37.5),
    maxRange: Number(device.maxRange ?? 40),
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

/** enrollPig — create a pig record in PocketBase. */
export async function enrollPig(name: string): Promise<Record<string, unknown>> {
  return pbCreate('pigs', {
    name,
    enrolledAt: new Date().toISOString(),
    healthStatus: 'NORMAL',
    tags: [],
  });
}

/** subscribeAlerts — live alerts from the `alerts` collection. */
export function subscribeAlerts(callback: (alerts: Record<string, unknown>[]) => void) {
  let cancelled = false;

  const emit = () => {
    pbList('alerts', { sort: '-timestamp', perPage: 50 })
      .then(({ items }) => {
        if (!cancelled) callback(items);
      })
      .catch(() => {
        if (!cancelled) callback([]);
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('alerts', () => emit());
  return () => {
    cancelled = true;
    unsub();
  };
}

/** subscribeSensors — live devices/sensor nodes from the `devices` collection. */
export function subscribeSensors(callback: (sensors: LiveSensorReading[]) => void) {
  let cancelled = false;

  const emit = () => {
    pbList('devices', { sort: '-created', perPage: 200 })
      .then(({ items }) => {
        if (!cancelled) callback(items.map(toLiveSensor));
      })
      .catch(() => {
        if (!cancelled) callback([]);
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