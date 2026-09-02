/**
 * PigPulse v3 — PocketBase client (drop-in for src/utils/firebase.ts)
 *
 * Zero-dep fetch-based SDK + realtime SSE helper.
 * Works on web and native (Expo). No `pocketbase` npm needed.
 *
 * Env:
 *   EXPO_PUBLIC_POCKETBASE_URL  e.g. http://127.0.0.1:8090  (native) or http://localhost:8090 (web)
 *   fallback: http://127.0.0.1:8090 / http://localhost:8090
 *
 * Usage:
 *   import { pbList, pbCreate, pbSubscribeRealtime, pbAuthAdmin } from '../utils/pocketbase'
 *   const {items} = await pbList('telemetry', { filter: "deviceId='esp32-001'", sort: '-timestamp', perPage: 20 })
 *   const unsub = pbSubscribeRealtime('telemetry', (e) => setItems(prev => [e.record, ...prev]))
 */

import { Platform } from 'react-native';

// Resolve base URL — native cannot use localhost correctly on some devices, so allow override
export const PB_URL: string =
  process.env.EXPO_PUBLIC_POCKETBASE_URL ||
  (Platform.OS === 'web' ? 'http://localhost:8090' : 'http://127.0.0.1:8090');

let adminToken: string | null = null;
let adminTokenExpiry = 0;

export interface PBListOptions {
  filter?: string;
  sort?: string;
  perPage?: number;
  page?: number;
  expand?: string;
  fields?: string;
}

export interface PBListResult<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

export interface PBRealtimeEvent {
  action: 'create' | 'update' | 'delete';
  record: Record<string, unknown> & { id: string; collectionName: string };
}

const PB_ADMIN_EMAIL = process.env.EXPO_PUBLIC_PB_EMAIL || 'admin@pigpulse.local';
const PB_ADMIN_PASS = process.env.EXPO_PUBLIC_PB_PASSWORD || 'admin123';

/**
 * Admin auth — caches token 55min. Use for dev/demo only; production should use user auth.
 */
export async function pbAuthAdmin(): Promise<string> {
  const now = Date.now() / 1000;
  if (adminToken && now < adminTokenExpiry - 60) return adminToken;
  const res = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASS }),
  });
  if (!res.ok) throw new Error(`PB admin auth ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { token: string };
  adminToken = data.token;
  adminTokenExpiry = now + 3600;
  return adminToken;
}

function authHeaders(token?: string | null): Record<string,string> {
  const h: Record<string,string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  else if (adminToken) h['Authorization'] = `Bearer ${adminToken}`;
  return h;
}

/**
 * Public GET — no auth needed because v3 collections have listRule="" (open). Add token if you lock them.
 */
export async function pbList<T = Record<string, unknown>>(
  collection: string,
  opts: PBListOptions = {},
  token?: string | null
): Promise<PBListResult<T>> {
  const params = new URLSearchParams();
  if (opts.filter) params.set('filter', opts.filter);
  if (opts.sort) params.set('sort', opts.sort);
  if (opts.perPage) params.set('perPage', String(opts.perPage));
  if (opts.page) params.set('page', String(opts.page));
  if (opts.expand) params.set('expand', opts.expand);
  if (opts.fields) params.set('fields', opts.fields);
  // PocketBase public collections — omit Authorization if open
  const headers: Record<string,string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const url = `${PB_URL}/api/collections/${collection}/records?${params.toString()}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`pbList ${collection} ${res.status}: ${await res.text()}`);
  return (await res.json()) as PBListResult<T>;
}

export async function pbCreate<T = Record<string, unknown>>(
  collection: string,
  data: Record<string, unknown>,
  token?: string | null
): Promise<T> {
  // For v3 open collections no token needed, but we try admin token as fallback
  let t = token;
  if (!t) {
    try { t = await pbAuthAdmin(); } catch { /* open collection */ }
  }
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records`, {
    method: 'POST',
    headers: t ? authHeaders(t) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`pbCreate ${collection} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/**
 * Realtime subscription via PocketBase SSE `/api/realtime`.
 * PocketBase protocol: GET /api/realtime, then POST subscribe per collection.
 * We use native EventSource on web, and fetch+EventSource polyfill on native.
 *
 * For native, install `react-native-sse` or use `eventsource` polyfill if needed.
 * This fallback polls every 3s on native if EventSource unavailable — keeps demo working.
 */
export function pbSubscribeRealtime(
  collection: string,
  cb: (e: PBRealtimeEvent) => void
): () => void {
  // Web: true EventSource
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'EventSource' in window) {
    const es = new EventSource(`${PB_URL}/api/realtime`);
    let subId: string | null = null;
    es.onopen = () => {
      // Subscribe to collection
      fetch(`${PB_URL}/api/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: (es as any).clientId || '', subscriptions: [collection] }),
      }).catch(() => {});
      // PocketBase JS SDK does: client.realtime.subscribe(collection, cb)
      // Raw SSE sends JSON per event; we parse here
    };
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.record && data.record.collectionName === collection) cb(data as PBRealtimeEvent);
        else if (data.collectionName === collection) cb(data as PBRealtimeEvent);
      } catch {}
    };
    es.onerror = () => {};
    return () => es.close();
  }

  // Native fallback: poll every 3s for new records (demo-grade realtime)
  let lastTs = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const poll = async () => {
    try {
      const { items } = await pbList(collection, { sort: '-created', perPage: 5 });
      for (const it of items.reverse()) {
        const ts = (it as any).created ? Date.parse((it as any).created) : 0;
        if (ts > lastTs) {
          lastTs = ts;
          if (!cancelled) cb({ action: 'create', record: it as any });
        }
      }
      // init lastTs on first poll without emitting backlog
      if (lastTs === 0 && items.length) lastTs = Math.max(...items.map((i: any) => Date.parse(i.created || 0)));
    } catch {}
  };
  poll();
  timer = setInterval(poll, 3000);
  return () => {
    cancelled = true;
    if (timer) clearInterval(timer);
  };
}

// Convenience wrappers matching firebase.ts signatures

export async function subscribeTelemetryPB(
  _deviceId: string,
  cb: (t: Record<string, unknown> | null) => void
) {
  try {
    const { items } = await pbList('telemetry', { filter: `deviceId='${_deviceId}'`, sort: '-timestamp', perPage: 1 });
    cb(items[0] || null);
  } catch { cb(null); }
  return pbSubscribeRealtime('telemetry', (e) => {
    if ((e.record as any).deviceId === _deviceId) cb(e.record);
  });
}

export async function subscribeAlertsPB(cb: (alerts: Record<string, unknown>[]) => void) {
  try {
    const { items } = await pbList('alerts', { sort: '-timestamp', perPage: 50 });
    cb(items);
  } catch { cb([]); }
  return pbSubscribeRealtime('alerts', () => {
    pbList('alerts', { sort: '-timestamp', perPage: 50 }).then(({ items }) => cb(items)).catch(() => {});
  });
}

export const pb = { url: PB_URL, list: pbList, create: pbCreate, subscribeRealtime: pbSubscribeRealtime };
