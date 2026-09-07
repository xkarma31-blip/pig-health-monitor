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

export type SensorReading = Record<string, unknown> & { id?: string; name?: string; temp?: number };

const noop = () => {};

/**
 * subscribeRoster — live roster from the `pigs` collection.
 * Emits the full list on subscribe + on any realtime change.
 */
export function subscribeRoster(callback: (roster: Record<string, unknown>[]) => void) {
  let cancelled = false;
  let done = false;

  const emit = () => {
    pbList('pigs', { sort: '-created', perPage: 200 })
      .then(({ items }) => {
        if (!cancelled) {
          callback(items);
          done = true;
        }
      })
      .catch(() => {
        if (!cancelled) {
          callback([]);
          done = true;
        }
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
export function subscribeSensors(callback: (sensors: SensorReading[]) => void) {
  let cancelled = false;

  const emit = () => {
    pbList('devices', { sort: '-created', perPage: 200 })
      .then(({ items }) => {
        if (!cancelled) callback(items as SensorReading[]);
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