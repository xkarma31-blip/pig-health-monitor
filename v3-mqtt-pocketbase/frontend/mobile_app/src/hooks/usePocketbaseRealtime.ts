/**
 * usePocketbaseRealtime.ts — isolated local-source reader for the Home screen (lane B6).
 *
 * Reads the `telemetry` collection from the ONE selected local source and
 * reports device monitoring: latest frame per device, transport status,
 * explicit-last error and sensor freshness (aged against a ticking clock, so it
 * keeps decaying even while the transport is down).
 *
 * Contract (see track-d1-ui.md Home/hook defects):
 *   - EXACTLY one source per cycle: native uses the FIRST resolved base or
 *     fails closed — it never silently cycles through candidate origins.
 *   - The farmer-saved setup is awaited BEFORE the first connect, and the host
 *     is re-resolved every cycle so a setup change applies without a remount.
 *   - Polling is single-flight (recursive timer, never overlapping ticks).
 *   - Every request carries a real AbortSignal and a deadline that also covers
 *     the body read; a generation token discards any late result after a
 *     reconnect, source switch or unmount (a signal alone is not enough).
 *   - The offline cache is versioned and scoped to the selected source; the
 *     legacy unsourced cache is NOT restored and frames never leak across
 *     sources.
 *   - A successful EMPTY payload is `empty`, not a fabricated stream; transport
 *     status stays separate from sensor freshness.
 *   - Error strings never carry the source URL (which may hold credentials).
 *
 * Environment:
 *   EXPO_PUBLIC_POCKETBASE_URL  (optional; native default is the Pi hotspot).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { probeAccess, reprobeDue } from '../utils/access-probe';
import {
  acceptIncomingFrame,
  aggregateFreshness,
  cacheKeyFor,
  deviceKey,
  parseCache,
  sanitizeFrame,
  serializeCache,
  sourceScope,
  stripCredentials,
  type ConnectionStatus,
  type FreshnessAggregate,
  type TelemetryFrame,
} from '../utils/home-telemetry';

export type { ConnectionStatus, TelemetryFrame } from '../utils/home-telemetry';

export interface PocketbaseRealtimeResult {
  /** Latest telemetry frame keyed by device identity. */
  telemetry: Record<string, TelemetryFrame>;
  /** All device identities seen so far. */
  deviceIds: string[];
  /** Transport/polling status, independent of sensor freshness. */
  connectionStatus: ConnectionStatus;
  /** Last error message with any source URL stripped, null when healthy. */
  lastError: string | null;
  /** Sensor freshness derived from the newest recorded timestamp. */
  freshness: FreshnessAggregate;
  /** Ticking clock used to age freshness continuously. */
  now: number;
  /** Manually restart the read cycle. */
  reconnect: () => void;
}

// ── Constants ──────────────────────────────────────────────────────

const POLL_INTERVAL = 3000;
/** Deadline for the whole request INCLUDING the body read. */
const REQUEST_TIMEOUT_MS = 10_000;
const NOW_TICK_MS = 5_000;

const WEB_QUERY = '/api/telemetry?collection=telemetry&sort=-timestamp&perPage=10';
const NATIVE_QUERY = '/api/collections/telemetry/records?sort=-timestamp&perPage=5';

type SourceModules = { resolveBaseUrls: () => string[] };

type ResolvedSource =
  | { ok: true; url: string; scope: string }
  | { ok: false; scope: string | null; error: string };

/** Pick exactly one source for this cycle; never fall through to a second box. */
function resolveSource(modules: SourceModules | null): ResolvedSource {
  if (!modules) return { ok: false, scope: null, error: 'Selected source is still loading.' };
  const bases = modules.resolveBaseUrls() ?? [];
  if (Platform.OS === 'web') {
    const base = bases[0] ?? '';
    const scope = sourceScope(base, 'web');
    return { ok: true, url: base ? `${base}${WEB_QUERY}` : WEB_QUERY, scope };
  }
  const base = bases[0];
  if (!base) return { ok: false, scope: null, error: 'No PocketBase server is selected.' };
  return { ok: true, url: `${base}${NATIVE_QUERY}`, scope: sourceScope(base, 'native') };
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message || String(error) : 'Poll failed';
  return stripCredentials(message);
}

// ── Hook ───────────────────────────────────────────────────────────

export function usePocketbaseRealtime(): PocketbaseRealtimeResult {
  const [telemetry, setTelemetry] = useState<Record<string, TelemetryFrame>>({});
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [lastError, setLastError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isMounted = useRef(true);
  const generation = useRef(0);
  const frames = useRef<Record<string, TelemetryFrame>>({});
  const ids = useRef<string[]>([]);
  const scope = useRef<string | null>(null);
  const modules = useRef<SourceModules | null>(null);
  const controller = useRef<AbortController | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRef = useRef<() => void>(() => {});
  const accessProbe = useRef<{ local: string; lan: string; remote: string; lastAt: number | null; failures: number } | null>(null);

  const reconnect = useCallback(() => {
    startRef.current();
  }, []);

  useEffect(() => {
    isMounted.current = true;

    const commit = () => {
      if (!isMounted.current) return;
      setTelemetry({ ...frames.current });
      setDeviceIds(ids.current.slice());
    };

    const clearTimers = () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
        pollTimer.current = null;
      }
      if (deadline.current) {
        clearTimeout(deadline.current);
        deadline.current = null;
      }
    };

    const applyItems = (items: unknown[], gen: number) => {
      if (!isMounted.current || gen !== generation.current) return;
      const stamp = Date.now();
      for (const raw of items) {
        const frame = sanitizeFrame(raw);
        if (!frame) continue;
        const key = deviceKey(frame);
        if (!key) continue;
        const next = acceptIncomingFrame(frames.current[key], frame, stamp);
        if (next) frames.current[key] = next;
        if (!ids.current.includes(key)) ids.current.push(key);
      }
      commit();
      const active = scope.current;
      if (active) {
        AsyncStorage.setItem(cacheKeyFor(active), serializeCache(frames.current, active)).catch(
          () => {
            /* cache write is non-fatal */
          },
        );
      }
      if (items.length === 0) {
        setConnectionStatus('empty');
      } else {
        setConnectionStatus(
          aggregateFreshness(frames.current, stamp).band === 'fresh' ? 'connected' : 'stale',
        );
      }
      setLastError(null);
    };

    const hydrate = async (nextScope: string, gen: number) => {
      try {
        const raw = await AsyncStorage.getItem(cacheKeyFor(nextScope));
        if (!isMounted.current || gen !== generation.current || scope.current !== nextScope) return;
        const cached = parseCache(raw, nextScope);
        if (Object.keys(cached).length === 0) return;
        frames.current = cached;
        ids.current = Object.keys(cached);
        commit();
      } catch {
        /* cache read is non-fatal */
      }
    };

    const schedule = (gen: number) => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
      pollTimer.current = setTimeout(() => {
        void runScan(gen);
      }, POLL_INTERVAL);
    };

    const runScan = async (gen: number) => {
      if (!isMounted.current || gen !== generation.current) return;
      try {
        const source = resolveSource(modules.current);
        if (!source.ok) {
          setConnectionStatus('error');
          setLastError(source.error);
          return;
        }
        // A source change isolates state and cache scope immediately.
        if (scope.current !== source.scope) {
          scope.current = source.scope;
          frames.current = {};
          ids.current = [];
          commit();
          await hydrate(source.scope, gen);
          if (!isMounted.current || gen !== generation.current) return;
        }

        const abort = new AbortController();
        controller.current = abort;
        const deadlineId = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
        deadline.current = deadlineId;
        try {
          const response = await fetch(source.url, {
            signal: abort.signal,
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = (await response.json()) as { items?: unknown } | null;
          if (!isMounted.current || gen !== generation.current) return;
          const items = data && Array.isArray(data.items) ? data.items : [];
          applyItems(items, gen);
        } finally {
          clearTimeout(deadlineId);
          if (deadline.current === deadlineId) deadline.current = null;
        }
      } catch (error) {
        if (!isMounted.current || gen !== generation.current) return;
        setConnectionStatus('error');
        setLastError(errorMessage(error));
      } finally {
        if (isMounted.current && gen === generation.current) schedule(gen);
      }
    };

    const startCycle = () => {
      const gen = ++generation.current;
      clearTimers();
      controller.current?.abort();
      controller.current = null;
      if (isMounted.current) setConnectionStatus('connecting');
      void runScan(gen);
    };
    startRef.current = startCycle;

    const boot = async () => {
      let started = false;
      try {
        const [pbModule, setupModule] = await Promise.all([
          import('../utils/pocketbase'),
          import('../utils/setupStore'),
        ]);
        // Publish the resolver BEFORE any probe can hang; a slow reachability
        // check must never leave the UI permanently "still loading".
        modules.current = { resolveBaseUrls: pbModule.resolveBaseUrls };
        const setup = await setupModule.loadFarmerSetup();
        if (Platform.OS !== 'web' && setup?.pbUrl) pbModule.setConfiguredServer(setup.pbUrl);
        if (Platform.OS !== 'web') {
          pbModule.setAccessConfig(setup.accessMode, setup.remotePbUrl, setup.lanPbUrl);
        }
        if (!isMounted.current) return;
        startCycle();
        started = true;

        if (Platform.OS !== 'web') {
          const localBase = setup.pbUrl || pbModule.PB_HOTSPOT_URL;
          let lanBase = setup.lanPbUrl;
          const remoteBase = setup.remotePbUrl;

          // While on the hotspot, learn the Pi's venue-LAN address from its
          // own portal status. That makes same-router access work later without
          // asking the farmer to type an IP or install a VPN.
          if (localBase === pbModule.PB_HOTSPOT_URL) {
            try {
              const res = await fetch('http://192.168.69.1/api/status', {
                headers: { Accept: 'application/json' },
              });
              if (res.ok) {
                const status = (await res.json()) as { uplink_ip?: string };
                if (status.uplink_ip) {
                  lanBase = `http://${status.uplink_ip}:8090`;
                  if (lanBase !== setup.lanPbUrl) {
                    await setupModule.saveFarmerSetup({ lanPbUrl: lanBase });
                  }
                  pbModule.setAccessConfig(setup.accessMode, remoteBase, lanBase);
                }
              }
            } catch {
              /* portal status is a convenience; saved config still works */
            }
          }

          const reach = await probeAccess(localBase, lanBase, remoteBase);
          pbModule.setAccessReachability(reach.local, reach.lan, reach.remote);
          accessProbe.current = {
            local: localBase,
            lan: lanBase,
            remote: remoteBase,
            lastAt: Date.now(),
            failures: reach.local || reach.lan || reach.remote ? 0 : 1,
          };
          startRef.current();
        }
      } catch {
        /* keep defaults; a setup read failure must not block the first connect */
      }
      if (!isMounted.current) return;
      if (!started) startCycle();
    };
    void boot();

    const nowTimer = setInterval(() => {
      if (isMounted.current) setNow(Date.now());
    }, NOW_TICK_MS);

    // Re-probe until a path recovers. A single launch-time failure must never
    // pin the whole session offline after the phone joins the hotspot or the
    // tunnel comes up.
    const probeTimer = setInterval(async () => {
      const probe = accessProbe.current;
      if (!probe || !isMounted.current || !reprobeDue(probe.lastAt, Date.now(), probe.failures)) return;
      probe.lastAt = Date.now();
      const reach = await probeAccess(probe.local, probe.lan, probe.remote);
      if (!isMounted.current) return;
      probe.failures = reach.local || reach.lan || reach.remote ? 0 : probe.failures + 1;
      const pbModule = await import('../utils/pocketbase');
      pbModule.setAccessReachability(reach.local, reach.lan, reach.remote);
      if (!reach.local && !reach.lan && !reach.remote) {
        setConnectionStatus('error');
        setLastError('Pi is offline — reconnect to PigPulse hotspot, use the venue Wi-Fi, or connect Tailscale');
        return;
      }
      startRef.current();
    }, 5_000);

    return () => {
      isMounted.current = false;
      generation.current += 1;
      clearTimers();
      controller.current?.abort();
      controller.current = null;
      clearInterval(nowTimer);
      clearInterval(probeTimer);
      startRef.current = () => {};
    };
  }, []);

  const freshness = useMemo(() => aggregateFreshness(telemetry, now), [telemetry, now]);

  return {
    telemetry,
    deviceIds,
    connectionStatus,
    lastError,
    freshness,
    now,
    reconnect,
  };
}
