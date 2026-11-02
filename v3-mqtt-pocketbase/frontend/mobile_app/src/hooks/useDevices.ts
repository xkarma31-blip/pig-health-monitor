/**
 * useDevices — the `devices` collection, live.
 *
 * Why both a fetch and a subscription: PocketBase realtime only emits records
 * that change *after* you subscribe, so a device that has been quiet since boot
 * would never appear. The list fetch paints the state, realtime keeps it fresh.
 *
 * Contract note (CANON §6 item 5): the ESP32-S3 firmware publishes no `status`
 * topic, so `s3-mic-01` may have no row here at all. Consumers must fall back to
 * telemetry recency — see `utils/live-source.ts`.
 */

import { useEffect, useRef, useState } from 'react';
import { pbList, pbSubscribeRealtime } from '../utils/pocketbase';

export interface DeviceRecord {
  id: string;
  deviceId: string;
  name?: string;
  type?: string;
  status?: string;
  lastSeen?: number;
  online?: boolean;
}

function mapRecord(raw: Record<string, unknown>, index: number): DeviceRecord {
  return {
    id: String(raw.id ?? index),
    deviceId: String(raw.deviceId ?? raw.id ?? index),
    name: typeof raw.name === 'string' ? raw.name : undefined,
    type: typeof raw.type === 'string' ? raw.type : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    lastSeen: typeof raw.lastSeen === 'number' ? raw.lastSeen : undefined,
    online: typeof raw.online === 'boolean' ? raw.online : undefined,
  };
}

export function useDevices(): { devices: DeviceRecord[]; loading: boolean } {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    const refresh = () => {
      pbList('devices', { sort: '-lastSeen', perPage: 50 })
        .then(({ items }) => {
          if (!mounted.current) return;
          setDevices(items.map(mapRecord));
        })
        .catch(() => {
          /* offline: keep whatever we already have */
        })
        .finally(() => {
          if (mounted.current) setLoading(false);
        });
    };

    refresh();
    const unsub = pbSubscribeRealtime('devices', refresh);

    return () => {
      mounted.current = false;
      unsub();
    };
  }, []);

  return { devices, loading };
}
