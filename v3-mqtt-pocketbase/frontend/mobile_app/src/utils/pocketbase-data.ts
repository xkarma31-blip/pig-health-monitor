/**
 * PigPulse v3 — PocketBase data layer (drop-in replacement for src/utils/firebase.ts API)
 *
 * Mirrors the v2 firebase.ts subscriber signatures so the ported deployed screens
 * work unchanged: subscribeRoster / subscribeAlerts / subscribeSensors /
 * subscribeTelemetry all talk to PocketBase (self-hosted, no Firebase).
 *
 * Roster enrollment changed 2026-11-02 (Track T5): `enrollPig(name)` became
 * `enrollAnonymousPig()` — the research log stores an anonymous `P-####` code
 * and never a name. See docs/track-t5-apps.md.
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
  const type = String(device.type || '').toLowerCase().includes('mic')
    || /mic|s3-mic|acoustic/i.test(name)
    ? 'acoustic'
    : 'thermal';
  const value =
    typeof device.lastValue === 'number' ? device.lastValue
    : typeof device.temperature === 'number' ? device.temperature
    : typeof device.temp === 'number' ? device.temp
    : 0;
  const lastUpdated = String(device.lastUpdated || device.lastSeen || new Date().toISOString());
  let status: SensorStatus = 'normal';
  const rawStatus = String(device.status || '');
  if (rawStatus === 'warning' || rawStatus === 'danger') status = rawStatus;
  else if (type === 'thermal' && value > Number(device.maxRange ?? 40)) {
    // Only thermal readings use the temperature danger heuristic — an
    // acoustic level above 40 (dB or any unit) is not a fever.
    status = 'danger';
  }
  return {
    id,
    type,
    label: name,
    icon: String(device.icon || (type === 'acoustic' ? '🎤' : '📡')),
    value,
    unit: String(device.unit || (type === 'acoustic' ? '' : '°C')),
    status,
    lastUpdated,
    minRange: Number(device.minRange ?? 37.5),
    maxRange: Number(device.maxRange ?? 40),
  };
}

/**
 * subscribeRoster — live roster from the `pigs` collection.
 * Emits the full list on subscribe + on any realtime change.
 *
 * `onError` exists so a caller can tell "the query failed" apart from "the
 * collection is empty". Swallowing the error and emitting [] presents a
 * connection outage as an empty result — the exact ambiguity the Pi console
 * forbids for its own readers.
 */
export function subscribeRoster(
  callback: (roster: Record<string, unknown>[]) => void,
  onError?: (error: unknown) => void,
) {
  let cancelled = false;

  const emit = () => {
    pbList('pigs', { sort: '-created', perPage: 200 })
      .then(({ items }) => {
        if (!cancelled) callback(items);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        onError?.(error);
        callback([]);
      });
  };

  emit();
  const unsub = pbSubscribeRealtime('pigs', () => emit());
  return () => {
    cancelled = true;
    unsub();
  };
}

/**
 * nextPigCode — next free anonymous code (P-0001 …) for this pen.
 *
 * The `pigs` schema requires `pigId` and has NO `enrolledAt` column (see
 * deploy/pocketbase/bin/pb_migrations/1790499383_created_pigs.js). The previous
 * enrollPig(name) payload omitted the required pigId and sent an undeclared
 * enrolledAt, so PocketBase rejected every enrollment and silently dropped the
 * date. This computes a code from records that actually exist.
 *
 * Two devices enrolling in the same second can compute the same code; pigId is
 * not unique in the schema, and a duplicate in a research log is preferable to
 * blocking a vet in the field.
 */
export function nextPigCode(records: Array<Record<string, unknown>>): string {
  let max = 0;
  for (const record of records) {
    const match = /^P-(\d{1,6})$/.exec(String(record.pigId ?? ''));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `P-${String(max + 1).padStart(4, '0')}`;
}

/**
 * enrollAnonymousPig — add one anonymous observation slot.
 * No name is written or read anywhere; identity is the P-#### code only.
 */
export async function enrollAnonymousPig(): Promise<Record<string, unknown>> {
  const { items } = await pbList('pigs', { sort: '-created', perPage: 200 });
  return pbCreate('pigs', {
    pigId: nextPigCode(items),
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