/**
 * PigPulse v3 — PocketBase client (drop-in for src/utils/firebase.ts)
 *
 * Zero-dep fetch-based SDK + realtime SSE helper.
 * Works on web and native (Expo). No `pocketbase` npm needed.
 *
 * Env:
 *   EXPO_PUBLIC_POCKETBASE_URL  Optional override. Unset is normal: native
 *                               defaults to the Pi's own hotspot address.
 *   fallback: http://192.168.69.1:8090 (Pi hotspot) / adb reverse / loopback
 *
 * Usage:
 *   import { pbList, pbCreate, pbSubscribeRealtime, pbAuthAdmin } from '../utils/pocketbase'
 *   const {items} = await pbList('telemetry', { filter: "deviceId='esp32-001'", sort: '-timestamp', perPage: 20 })
 *   const unsub = pbSubscribeRealtime('telemetry', (e) => setItems(prev => [e.record, ...prev]))
 */

import { Platform } from 'react-native';
import { chooseAccessSource, chooseNativeSource, type AccessMode, type SourceDecision } from './source-policy';

// Resolve base URL.
// Web: empty string => same-origin requests (`/api/...`). A public browser can
// never reach a dev machine's loopback, and cross-origin hosts would be blocked
// by the deployed CSP `connect-src 'self'`.
// Native: exactly ONE source is selected (see source-policy.ts) — never a
// failover list. Order: farmer-saved setup address → build-time env → the Pi's
// own hotspot gateway. There is no implicit hosted (Vercel) or laptop-loopback
// fallback, and a malformed explicit config fails closed instead of being
// silently replaced by a lower tier.
// The hotspot default needs no setup at all: a phone joined to the PigPulse AP
// reaches PocketBase on the Pi (pocketbase serve --http=0.0.0.0:8090) with no
// adb tunnel and no laptop. The old 127.0.0.1:18090 only worked while
// `adb reverse` was alive — i.e. only while the phone was tethered to the dev
// machine — which is exactly the implicit-fallback defect this policy removes.
// A tiny async indirection keeps this module import-synchronous; the setup
// screen calls setConfiguredServer() before the wizard finishes.
export const PB_HOTSPOT_URL = 'http://192.168.69.1:8090';
// Kept exported for interface stability. It no longer drives failover: the
// resolver below selects a single source, and this is only the default tier.
const PB_FALLBACKS: string[] = Platform.OS === 'web' ? [''] : [PB_HOTSPOT_URL];

let configuredServer = '';
let accessMode: AccessMode = 'auto';
let lanServer = '';
let remoteServer = '';
let localReachable = true;
let lanReachable = false;
let remoteReachable = false;
let accessReason = 'Using the PigPulse hotspot';

/** Configure local-first access. Remote must be the same Pi over a VPN/tunnel. */
export function setAccessConfig(
  mode: AccessMode,
  remoteUrl: string | null | undefined,
  lanUrl?: string | null,
) {
  accessMode = mode === 'remote' || mode === 'local' ? mode : 'auto';
  lanServer = (lanUrl ?? '').trim().replace(/\/+$/, '');
  remoteServer = (remoteUrl ?? '').trim().replace(/\/+$/, '');
}

/** Last reachability probe result; the resolver itself stays synchronous. */
export function setAccessReachability(local: boolean, lan: boolean, remote: boolean) {
  localReachable = local;
  lanReachable = lan;
  remoteReachable = remote;
}

export function getAccessReason(): string {
  return accessReason;
}

export function setConfiguredServer(url: string | null | undefined) {
  const clean = (url || '').trim().replace(/\/+$/, '');
  if (clean !== configuredServer) {
    // Any server change — including clearing to '' (setup skip path) — must
    // drop the previous host's session. A stale bearer token attached to a
    // new base is a credential leak across servers.
    adminToken = null;
    adminTokenExpiry = 0;
    configuredServer = clean;
    localReachable = true;
    lanReachable = false;
    remoteReachable = false;
  }
}

export const PB_URL: string =
  Platform.OS === 'web' ? '' : process.env.EXPO_PUBLIC_POCKETBASE_URL || '';
export const PB_FALLBACK_URLS = PB_FALLBACKS;

/**
 * The single selected PocketBase source (see source-policy.ts). Web is always
 * same-origin; native prefers the saved setup address, then the build-time env
 * var, then the Pi hotspot. The saved address MUST outrank the build-time env
 * var: a device build carrying a baked-in URL must still follow the farmer's
 * saved box. A malformed explicit source fails closed (base null) and is
 * surfaced rather than silently replaced by a lower tier.
 */
export function resolveSelectedSource(): SourceDecision {
  if (Platform.OS === 'web') {
    return { base: '', kind: 'web-same-origin', malformed: false, explicit: false };
  }
  const local = chooseNativeSource({
    saved: configuredServer,
    build: process.env.EXPO_PUBLIC_POCKETBASE_URL ?? '',
    piDefault: PB_HOTSPOT_URL,
  });
  const decision = chooseAccessSource({
    mode: accessMode,
    localBase: local.base,
    lanBase: lanServer,
    remoteBase: remoteServer,
    localReachable,
    lanReachable,
    remoteReachable,
  });
  accessReason = decision.reason;
  if (decision.kind === 'malformed') {
    return { base: null, kind: 'malformed', malformed: true, explicit: true };
  }
  return {
    base: decision.base,
    kind: decision.kind,
    malformed: false,
    explicit: decision.kind === 'remote' || local.explicit,
  };
}

/**
 * Base URLs to try. Exactly zero or one native source: an empty array means the
 * explicit configuration is malformed and callers must fail closed — there is
 * no cross-origin retry. Web always resolves to same-origin ('') because the
 * public CSP forbids cross-origin.
 */
export function resolveBaseUrls(): string[] {
  if (Platform.OS === 'web') return [''];
  const decision = resolveSelectedSource();
  return decision.base ? [decision.base] : [];
}

/**
 * The one selected base, or a thrown error. Shared by every network caller so
 * a malformed explicit native config fails closed identically everywhere: no
 * request, no relative fetch, no cross-origin retry. On web the selected base
 * is the valid same-origin empty string, which is preserved (never treated as
 * "missing").
 */
function requireSelectedBase(context: string): string {
  const base = resolveBaseUrls()[0];
  if (base === undefined) {
    throw new Error(`${context} failed: no selected PocketBase source`);
  }
  return base;
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
  const base = requireSelectedBase('pbAuthAdmin');
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
  // Exactly one selected source. An empty list means the explicit config is
  // malformed: fail closed — no request, no cross-origin retry, and therefore
  // no chance of a bearer token crossing to another origin.
  const base = requireSelectedBase(`pbList ${collection}`);
  // Web: a public browser cannot reach the laptop-bound PocketBase, and the
  // deployed app has no `/api/collections/...` serverless function — that
  // path answers HTTP 404 in production. The only public read path is the
  // `/api/telemetry` bridge, which forwards the same allowlisted GET to the
  // read-only proxy and returns PocketBase's own list payload shape
  // (page/perPage/totalItems/totalPages/items), so the response contract is
  // identical to a direct PB read.
  // Native: direct PocketBase, unchanged.
  const query = params.toString();
  const url = Platform.OS === 'web'
    ? `${base}/api/telemetry?collection=${encodeURIComponent(collection)}${query ? `&${query}` : ''}`
    : `${base}/api/collections/${collection}/records${query ? `?${query}` : ''}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`pbList ${collection} ${res.status}: ${await res.text()}`);
  return (await res.json()) as PBListResult<T>;
}

export async function pbCreate<T = Record<string, unknown>>(
  collection: string,
  data: Record<string, unknown>,
  token?: string | null
): Promise<T> {
  // Resolve the one selected source FIRST: a malformed explicit native config
  // must fail closed before any request — including before the admin-auth
  // attempt, which would otherwise fire its own relative fetch. Web's valid
  // same-origin '' is preserved.
  const base = requireSelectedBase(`pbCreate ${collection}`);
  // For v3 open collections no token needed, but we try admin token as fallback
  let t = token;
  if (!t) {
    try { t = await pbAuthAdmin(); } catch { /* open collection */ }
  }
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
        // POST must reference. It fires once per connection, including
        // every auto-reconnect — each connection must be (re)subscribed,
        // because the server tracks subscriptions per clientId.
        if (data.clientId && !data.record && !data.action) {
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
      /* EventSource reconnects by itself; the next PB_CONNECT re-triggers
         the subscription POST for the new connection. */
    };
    return () => {
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
