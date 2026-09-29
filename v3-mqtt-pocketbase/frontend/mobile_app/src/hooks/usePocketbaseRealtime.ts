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

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

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

const PB_URL =
  process.env.EXPO_PUBLIC_POCKETBASE_URL ||
  (Platform.OS === 'web' ? 'http://localhost:8090' : 'http://127.0.0.1:18090');

const CACHE_KEY = 'pigpulse.realtime.cache';
const RECONNECT_BASE_DELAY = 1000;
const RECONNECT_MAX_DELAY = 30000;
const POLL_INTERVAL = 3000;

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
      const next = { ...prev, [deviceId]: frame };
      // Persist to offline cache (fire-and-forget)
      writeCache(next);
      return next;
    });
    setDeviceIds((prev) => (prev.includes(deviceId) ? prev : [...prev, deviceId]));
    setConnectionStatus('connected');
    setLastError(null);
    reconnectAttempts.current = 0;
  }, []);

  // ── Web: native EventSource ──────────────────────────────────────
  const connectWeb = useCallback(() => {
    if (!isMounted.current) return;
    setConnectionStatus('connecting');

    try {
      const es = new EventSource(`${PB_URL}/api/realtime`);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isMounted.current) return;
        setConnectionStatus('connected');
        setLastError(null);
        reconnectAttempts.current = 0;
        // Subscribe to telemetry collection
        fetch(`${PB_URL}/api/realtime`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId: (es as any).clientId || '', subscriptions: ['telemetry'] }),
        }).catch(() => {});
      };

      es.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.record && (data.record.collectionName === 'telemetry' || data.action)) {
            handleFrame(data.record as TelemetryFrame);
          }
        } catch {
          /* ignore malformed frames */
        }
      };

      es.onerror = () => {
        if (!isMounted.current) return;
        setConnectionStatus('error');
        setLastError('EventSource connection lost');
        es.close();
        eventSourceRef.current = null;
        // Schedule reconnect
        const delay = Math.min(
          RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current),
          RECONNECT_MAX_DELAY
        );
        reconnectAttempts.current += 1;
        reconnectTimer.current = setTimeout(() => {
          if (isMounted.current) connectWeb();
        }, delay);
      };
    } catch (e: unknown) {
      setConnectionStatus('error');
      setLastError(e instanceof Error ? String(e.message || e) : 'Failed to open EventSource');
    }
  }, [handleFrame]);

  // ── Native: polling fallback ─────────────────────────────────────
  const connectNative = useCallback(async () => {
    if (!isMounted.current) return;
    setConnectionStatus('connecting');

    const poll = async () => {
      if (!isMounted.current) return;
      try {
        const res = await fetch(
          `${PB_URL}/api/collections/telemetry/records?sort=-timestamp&perPage=5`,
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.items && Array.isArray(data.items)) {
          for (const item of data.items) {
            handleFrame(item as TelemetryFrame);
          }
        }
      } catch (e: unknown) {
        if (!isMounted.current) return;
        setConnectionStatus('error');
        setLastError(e instanceof Error ? String(e.message || e) : 'Poll failed');
      }
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

    // Hydrate from cache first (instant offline display)
    readCache().then((cached) => {
      if (isMounted.current && Object.keys(cached).length > 0) {
        setTelemetry(cached);
        setDeviceIds(Object.keys(cached));
      }
    });

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
