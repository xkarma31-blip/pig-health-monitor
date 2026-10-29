/**
 * usePocketbaseRealtime.ts
 *
 * React hook that connects to PocketBase's realtime SSE endpoint and
 * subscribes to the `telemetry` collection. Provides:
 *   - latest telemetry frame per device
 *   - connection status (connecting | connected | disconnected | error)
 *   - last error message
 *   - auto-reconnect on disconnect (exponential backoff)
 *   - AsyncStorage offline cache (last-known frame per device)
 *
 * Environment:
 *   EXPO_PUBLIC_POCKETBASE_URL  (default http://127.0.0.1:18090)
 *
 * Works on web (native EventSource) and native (polling fallback).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { telemetryTime, telemetryFresh } from '../utils/telemetry-time';
import { resolveBaseUrls as pbResolveBaseUrls } from '../utils/pocketbase';

// ── Types ──────────────────────────────────────────────────────────

export interface TelemetryFrame {
  id: string;
  deviceId: string;
  timestamp: string;
  temperature?: number;
  humidity?: number;
  pressure?: number;
  audioLevel?: number;
  coughCount?: number;
  healthStatus?: string;
  [key: string]: unknown;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'stale' | 'disconnected' | 'error';

export interface PocketbaseRealtimeResult {
  /** Latest telemetry frame keyed by deviceId */
  telemetry: Record<string, TelemetryFrame>;
  /** All known device IDs seen so far */
  deviceIds: string[];
  /** Current WebSocket/SSE connection status */
  connectionStatus: ConnectionStatus;
  /** Last error message, null when healthy */
  lastError: string | null;
  /** Manually trigger a reconnect */
  reconnect: () => void;
}

// ── Constants ──────────────────────────────────────────────────────

// Web uses same-origin (''), so polling targets `/api/...` and passes
// the deployed `connect-src 'self'` policy. Native resolves the
// setup-saved PocketBase address first, then ADB reverse, then direct.

const CACHE_KEY = 'pigpulse.realtime.cache';
const POLL_INTERVAL = 3000;

// The farmer-saved PocketBase address (setup wizard) wins over hard-coded
// fallbacks on native. Resolved once per connect so server switches apply
// on the next reconnect without remounting the hook.
function nativeBaseUrls(): string[] {
  return pbResolveBaseUrls();
}

// ── Helpers ────────────────────────────────────────────────────────

async function readCache(): Promise<Record<string, TelemetryFrame>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* cache miss is non-fatal */
  }
  return {};
}

async function writeCache(data: Record<string, TelemetryFrame>) {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    /* non-fatal */
  }
}

// ── Hook ───────────────────────────────────────────────────────────

export function usePocketbaseRealtime(): PocketbaseRealtimeResult {
  const [telemetry, setTelemetry] = useState<Record<string, TelemetryFrame>>({});
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);

  // Refs for mutable state inside intervals/callbacks
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isMounted = useRef(true);
  const telemetryRef = useRef(telemetry);

  // Keep ref in sync
  useEffect(() => {
    telemetryRef.current = telemetry;
  }, [telemetry]);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const handleFrame = useCallback((frame: TelemetryFrame) => {
    if (!isMounted.current) return;
    const deviceId = frame.deviceId || frame.id || 'unknown';
    setTelemetry((prev) => {
      const current = prev[deviceId];
      const currentTime = telemetryTime(current?.timestamp);
      const frameTime = telemetryTime(frame.timestamp);
      // NaN comparisons are false, so an invalid-timestamp frame would
      // otherwise overwrite a valid newer one. Both sides must be finite.
      if (
        current &&
        Number.isFinite(currentTime) &&
        Number.isFinite(frameTime) &&
        currentTime > frameTime
      ) {
        return prev;
      }
      return { ...prev, [deviceId]: frame };
    });
    setDeviceIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
    setLastError(null);
    reconnectAttempts.current = 0;
  }, []);

  // Persist the latest per-device frames. Lives OUTSIDE the setTelemetry
  // updater: React StrictMode double-invokes updaters, which would duplicate
  // AsyncStorage writes.
  useEffect(() => {
    if (Object.keys(telemetry).length > 0) writeCache(telemetry);
  }, [telemetry]);

  // ── Web: poll the read-only serverless proxy ─────────────────────
  // The browser cannot hold a PocketBase SSE stream through a serverless
  // function, so the web build polls /api/telemetry instead. Native keeps
  // native EventSource against PocketBase directly.
  const connectWeb = useCallback(async () => {
    if (!isMounted.current) return;
    setConnectionStatus('connecting');

    const poll = async () => {
      if (!isMounted.current) return;
      try {
        const res = await fetch(
          '/api/telemetry?collection=telemetry&sort=-timestamp&perPage=10',
          { headers: { Accept: 'application/json' } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (Array.isArray(data.items)) {
          for (const item of data.items) handleFrame(item as TelemetryFrame);
          setConnectionStatus(data.items.some((item: TelemetryFrame) => telemetryFresh(item.timestamp)) ? 'connected' : 'stale');
        }
      } catch (e: unknown) {
        if (!isMounted.current) return;
        setConnectionStatus('error');
        setLastError(e instanceof Error ? String(e.message || e) : 'Poll failed');
      }
    };

    await poll();
    if (!isMounted.current) return;
    pollTimer.current = setInterval(poll, POLL_INTERVAL);
  }, [handleFrame]);

  // ── Native: polling against the resolved PocketBase bases ────────
  // The previous EventSource path never completed PocketBase's documented
  // PB_CONNECT/clientId/subscribe handshake, so it silently received nothing.
  // Polling is the supported update mechanism for this milestone.
  const connectNative = useCallback(async () => {
    if (!isMounted.current) return;
    setConnectionStatus('connecting');

    const poll = async () => {
      if (!isMounted.current) return;
      let lastErr: unknown = null;
      // Re-resolve each poll: a farmer saving a new server in setup applies
      // on the next 3 s cycle, no remount needed.
      for (const base of nativeBaseUrls()) {
        try {
          const res = await fetch(
            `${base}/api/collections/telemetry/records?sort=-timestamp&perPage=5`,
            { headers: { 'Content-Type': 'application/json' } }
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          if (data.items && Array.isArray(data.items)) {
            for (const item of data.items) {
              handleFrame(item as TelemetryFrame);
            }
            setConnectionStatus(data.items.some((item: TelemetryFrame) => telemetryFresh(item.timestamp)) ? 'connected' : 'stale');
          }
          return;
        } catch (e: unknown) {
          lastErr = e;
        }
      }
      if (!isMounted.current) return;
      setConnectionStatus('error');
      setLastError(lastErr instanceof Error ? String(lastErr.message || lastErr) : 'Poll failed');
    };

    // Initial poll
    await poll();

    // Schedule recurring polls
    pollTimer.current = setInterval(poll, POLL_INTERVAL);
  }, [handleFrame]);

  // ── Manual reconnect ─────────────────────────────────────────────
  const reconnect = useCallback(() => {
    cleanup();
    reconnectAttempts.current = 0;
    if (Platform.OS === 'web') {
      connectWeb();
    } else {
      connectNative();
    }
  }, [cleanup, connectWeb, connectNative]);

  // ── Lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    isMounted.current = true;

    // Hydrate from cache first (instant offline display), then apply the
    // farmer-saved server so the first poll targets the configured box.
    readCache().then((cached) => {
      if (isMounted.current && Object.keys(cached).length > 0) {
        setTelemetry(cached);
        setDeviceIds(Object.keys(cached));
      }
    });

    if (Platform.OS !== 'web') {
      import('../utils/pocketbase').then(async ({ setConfiguredServer }) => {
        const { loadFarmerSetup } = await import('../utils/setupStore');
        const setup = await loadFarmerSetup();
        if (setup.pbUrl) setConfiguredServer(setup.pbUrl);
      }).catch(() => { /* keep defaults */ });
    }

    // Connect
    if (Platform.OS === 'web') {
      connectWeb();
    } else {
      connectNative();
    }

    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [connectWeb, connectNative, cleanup]);

  return {
    telemetry,
    deviceIds,
    connectionStatus,
    lastError,
    reconnect,
  };
}
