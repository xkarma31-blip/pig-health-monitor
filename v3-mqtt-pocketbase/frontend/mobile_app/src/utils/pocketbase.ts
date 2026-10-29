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

// Resolve base URL.
// Web: empty string => same-origin requests (`/api/...`). A public browser can
// never reach a dev machine's loopback, and cross-origin hosts would be blocked
// by the deployed CSP `connect-src 'self'`.
// Native: the farmer-saved setup address is the source of truth when present,
// then ADB reverse (127.0.0.1:18090), then direct PocketBase.
// A tiny async indirection keeps this module import-synchronous; the setup
// screen calls setConfiguredServer() before the wizard finishes.
const PB_FALLBACKS: string[] = (
  Platform.OS === 'web'
    ? ['']
    : [
        'http://127.0.0.1:18090', // adb reverse tcp:18090 tcp:8090
        'http://127.0.0.1:8090',
      ]
).filter((url): url is string => typeof url === 'string');

let configuredServer = '';

export function setConfiguredServer(url: string | null | undefined) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean !== configuredServer) {
    // Any server change — including clearing to '' (setup skip path) — must
    // drop the previous host's session. A stale bearer token attached to a
    // new base is a credential leak across servers.
    adminToken = null;
    adminTokenExpiry = 0;
    configuredServer = clean;
  }
}

export const PB_URL: string =
  Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_POCKETBASE_URL || '';
export const PB_FALLBACK_URLS = PB_FALLBACKS;

/**
 * Native base resolution order:
 *   1. configuredServer — the farmer-saved setup address (runtime state,
 *      the source of truth once the wizard completes)
 *   2. EXPO_PUBLIC_POCKETBASE_URL — build-time default (e.g. EAS profiles)
 *   3. ADB reverse / loopback dev fallbacks
 * The saved address must outrank the build-time env var: a device build
 * carrying a baked-in URL must still follow the farmer's saved box.
 * Web always resolves to same-origin ('') — public CSP forbids cross-origin.
 */
export function resolveBaseUrls(): string[] {
  if (Platform.OS === 'web') return [''];
  const urls = [
    configuredServer,
    process.env.EXPO_PUBLIC_POCKETBASE_URL,
    ...PB_FALLBACKS,
  ].filter((u): u is string => typeof u === 'string' && u.length > 0);
  return Array.from(new Set(urls));
}

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

// Admin credentials are deliberately NOT read from env here. Any
// EXPO_PUBLIC_* reference is inlined into the client bundle by `expo export`,
// which publishes the database admin login to anyone who views source.
// Requests to open collections need no auth; privileged writes belong in a
// server-side proxy, never in this client. See utils/pocketbase-auth.ts for
// the user-auth path used by the app.
const PB_ADMIN_EMAIL = '';
const PB_ADMIN_PASS = '';

/**
 * Admin auth — caches token 55min. Use for dev/demo only; production should use user auth.
 */
export async function pbAuthAdmin(): Promise<string> {
  const now = Date.now() / 1000;
  if (adminToken && now < adminTokenExpiry - 60) return adminToken;
  const base = resolveBaseUrls()[0] ?? '';
  const res = await fetch(`${base}/api/admins/auth-with-password`, {
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
  const headers: Record<string,string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  // Try every resolved base (setup-saved address first, then fallbacks)
  const urls = resolveBaseUrls();
  let lastErr: string = '';
  for (const base of urls) {
    const url = `${base}/api/collections/${collection}/records?${params.toString()}`;
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`pbList ${collection} ${res.status}: ${await res.text()}`);
      return (await res.json()) as PBListResult<T>;
    } catch (e:any) {
      lastErr = String(e.message || e);
      // try next fallback on network failure
      if (lastErr.includes('Failed to fetch') || lastErr.includes('Network') || lastErr.includes('Load failed')) continue;
      throw e;
    }
  }
  throw new Error(lastErr || `pbList ${collection} failed all PB URLs`);
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
  const base = resolveBaseUrls()[0] ?? '';
  const res = await fetch(`${base}/api/collections/${collection}/records`, {
    method: 'POST',
    headers: t ? authHeaders(t) : { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`pbCreate ${collection} ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/**
 * Realtime subscription via PocketBase SSE `/api/realtime`.
 * Protocol (per PocketBase docs): GET /api/realtime opens the SSE stream and
 * the server immediately sends a `PB_CONNECT` event whose JSON payload
 * carries the clientId. Subscription then happens via POST /api/realtime with
 * {clientId, subscriptions: ["<collection>/*"]}. Without that POST the server
 * delivers nothing — the clientId MUST come from the PB_CONNECT message, not
 * from any EventSource property (none exists).
 *
 * Native has no EventSource: it polls every 3s instead.
 */
export function pbSubscribeRealtime(
  collection: string,
  cb: (e: PBRealtimeEvent) => void
): () => void {
  // Web: true EventSource
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'EventSource' in window) {
    const base = resolveBaseUrls()[0] ?? '';
    const es = new EventSource(`${base}/api/realtime`);
    let subscribed = false;
    const subscribe = (clientId: string) => {
      fetch(`${base}/api/realtime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, subscriptions: [collection] }),
      }).catch(() => {
        /* subscription failure degrades to the caller's own polling */
      });
    };
    es.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        // Handshake: PB_CONNECT carries the clientId the subscription
        // POST must reference. Fires once per connection (and once per
        // auto-reconnect — hence the guard, resubscribe each reconnect).
        if (data.clientId && !data.record && !data.action) {
          subscribed = true;
          subscribe(String(data.clientId));
          return;
        }
        if (data.record && data.record.collectionName === collection) cb(data as PBRealtimeEvent);
        else if (data.collectionName === collection) cb(data as PBRealtimeEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    es.onerror = () => {
      // EventSource auto-reconnects; the new PB_CONNECT re-triggers
      // subscription via the subscribed guard above.
      subscribed = false;
    };
    return () => {
      subscribed = false;
      es.close();
    };
  }

  // Native: poll for new records (no EventSource on RN)
  let lastTs = 0;
  let cancelled = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  const poll = async () => {
    try {
      const { items } = await pbList(collection, { sort: '-created', perPage: 5 });
      // First poll: initialise the cursor from the newest existing record
      // BEFORE emitting, so a fresh subscription does not replay history
      // into the callback as fake "new" events.
      if (lastTs === 0) {
        if (items.length) {
          lastTs = Math.max(
            ...items.map((i) => Date.parse(String((i as Record<string, unknown>).created || '')) || 0)
          );
        }
        return;
      }
      for (const it of items.slice().reverse()) {
        const ts = Date.parse(String((it as Record<string, unknown>).created || '')) || 0;
        if (ts > lastTs) {
          lastTs = ts;
          if (!cancelled) cb({ action: 'create', record: it as PBRealtimeEvent['record'] });
        }
      }
    } catch {
      /* network error: keep polling, caller surfaces via its own status */
    }
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

export const pb = { list: pbList, create: pbCreate, subscribeRealtime: pbSubscribeRealtime, resolveBaseUrls };
