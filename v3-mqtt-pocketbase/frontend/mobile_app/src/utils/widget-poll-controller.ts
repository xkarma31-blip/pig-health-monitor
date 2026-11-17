/**
 * React-free polling controller for the native Android home-screen widget.
 *
 * The controller owns the widget's whole cycle and is driven entirely through
 * injected dependencies, so its behavior is exercisable under the repository's
 * plain tsx runner with real controller logic and fake adapters — never mocked
 * controller internals. It has no React, React Native or Expo import.
 *
 * Contract:
 *   - the farmer's selected source is resolved BEFORE the first list request,
 *     and a malformed (null) source fails closed with no list request;
 *   - exactly one deterministic device is selected; telemetry and alert queries
 *     are scoped to it, and the newest rows are re-chosen locally because the
 *     server sort order is not authoritative;
 *   - polling is single-flight — a cycle never overlaps the next;
 *   - every list request carries a real AbortSignal with a deadline that stays
 *     armed through the adapter's body read;
 *   - a generation token discards any result arriving after stop/restart, and
 *     cleanup stops timers and aborts the in-flight request with no further
 *     list or write calls;
 *   - only a material visible-state change replaces the cache file, and a
 *     failed write keeps the last valid file and the last accepted signature.
 */

import {
  replaceWidgetStateFile,
  resolveWidgetIdentity,
  selectNewestAlert,
  selectNewestTelemetry,
  selectWidgetDevice,
  type WidgetStateFileAdapter,
  type WidgetSyncRecord,
} from './widget-sync';
import {
  buildWidgetState,
  widgetStateSignature,
  type WidgetState,
  type WidgetStateInput,
  type WidgetTheme,
} from './widget-state';

/** Poll cadence; matches the native provider's fallback refresh window scale. */
export const WIDGET_POLL_INTERVAL_MS = 30_000;
/** Deadline for a single list request INCLUDING the adapter's body read. */
export const WIDGET_REQUEST_DEADLINE_MS = 10_000;
export const WIDGET_TELEMETRY_PER_PAGE = 10;
export const WIDGET_ALERTS_PER_PAGE = 50;
export const WIDGET_DEVICES_PER_PAGE = 50;

/** Minimal list query the controller needs from the PocketBase data client. */
export interface WidgetPollListOptions {
  /**
   * Base origin of the source resolved for THIS cycle. Every list call in a
   * cycle carries the same value so a list request can target only the selected
   * origin and cannot race against a changing global source.
   */
  baseUrl: string;
  filter?: string;
  sort?: string;
  perPage?: number;
  signal: AbortSignal;
}

export interface WidgetPollListAdapter {
  list(
    collection: string,
    options: WidgetPollListOptions,
  ): Promise<readonly WidgetSyncRecord[]>;
}

/**
 * Resolves the ONE selected local source. Returning `null` (or a promise of
 * `null`) is a malformed/unavailable source: the controller then makes no list
 * request at all.
 */
export interface WidgetPollSourceProvider {
  resolve(): string | null | Promise<string | null>;
}

export interface WidgetPollControllerOptions {
  list: WidgetPollListAdapter;
  files: WidgetStateFileAdapter;
  /** Durable widget-cache target; replaced via a sibling temp + move. */
  targetPath: string;
  source: WidgetPollSourceProvider;
  now?: () => number;
  theme?: () => WidgetTheme;
  onError?: (error: unknown) => void;
  setTimeout?: (handler: () => void, timeout: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  intervalMs?: number;
  deadlineMs?: number;
  telemetryPerPage?: number;
  alertsPerPage?: number;
  devicesPerPage?: number;
}

export interface WidgetPollController {
  /** Begin the poll cadence (idempotent while already running). */
  start(): void;
  /** Stop timers, abort the in-flight request and make the controller inert. */
  stop(): void;
  /** Run one cycle now (no-op after stop); used for immediate refreshes/tests. */
  refresh(): Promise<void>;
}

interface InflightRequest {
  controller: AbortController;
  timer: unknown;
}

function clampPerPage(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export function createWidgetPollController(
  options: WidgetPollControllerOptions,
): WidgetPollController {
  const {
    list,
    files,
    targetPath,
    source,
    now = () => Date.now(),
    theme = () => 'light' as const,
    onError = () => {},
    setTimeout: scheduleTimeout = (handler, timeout) => setTimeout(handler, timeout),
    clearTimeout: cancelTimeout = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    intervalMs = WIDGET_POLL_INTERVAL_MS,
    deadlineMs = WIDGET_REQUEST_DEADLINE_MS,
  } = options;

  const telemetryPerPage = clampPerPage(
    options.telemetryPerPage ?? WIDGET_TELEMETRY_PER_PAGE,
    5,
    20,
  );
  const alertsPerPage = clampPerPage(
    options.alertsPerPage ?? WIDGET_ALERTS_PER_PAGE,
    1,
    WIDGET_ALERTS_PER_PAGE,
  );
  const devicesPerPage = clampPerPage(
    options.devicesPerPage ?? WIDGET_DEVICES_PER_PAGE,
    1,
    WIDGET_DEVICES_PER_PAGE,
  );

  let generation = 0;
  let active = false;
  let disposed = false;
  let currentRun: { generation: number; promise: Promise<void> } | null = null;
  let pollTimer: unknown = null;
  let lastSignature: string | null = null;
  const inflight = new Set<InflightRequest>();

  const isStale = (gen: number): boolean => disposed || gen !== generation;

  const clearPollTimer = (): void => {
    if (pollTimer !== null) {
      cancelTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const scheduleNext = (): void => {
    if (pollTimer !== null || !active) return;
    pollTimer = scheduleTimeout(() => {
      pollTimer = null;
      if (!active) return;
      void runCycle();
    }, intervalMs);
  };

  const request = async (
    collection: string,
    baseUrl: string,
    options2: Omit<WidgetPollListOptions, 'signal' | 'baseUrl'>,
  ): Promise<readonly WidgetSyncRecord[]> => {
    const controller = new AbortController();
    const handle: InflightRequest = {
      controller,
      timer: scheduleTimeout(() => controller.abort(), deadlineMs),
    };
    inflight.add(handle);
    try {
      // The deadline stays armed across this await: the adapter consumes the
      // response body before it resolves, so the signal covers the body read.
      return await list.list(collection, { ...options2, baseUrl, signal: controller.signal });
    } finally {
      cancelTimeout(handle.timer);
      inflight.delete(handle);
    }
  };

  const maybeWrite = async (state: WidgetState, gen: number): Promise<void> => {
    const signature = widgetStateSignature(state);
    if (signature === lastSignature) return;
    if (isStale(gen)) return;
    await replaceWidgetStateFile(files, targetPath, JSON.stringify(state));
    if (isStale(gen)) return;
    // Only a successful replacement accepts the new signature; a failed write
    // keeps the previous one so the next cycle can retry the same material state.
    lastSignature = signature;
  };

  const cycle = async (gen: number): Promise<void> => {
    try {
      const base = await source.resolve();
      if (isStale(gen)) return;
      // Malformed/unavailable source: fail closed, make no list request.
      if (!base) return;

      const [devicesSeconds, devicesMilliseconds] = await Promise.all([
        request('devices', base, {
          filter: 'lastSeen<1000000000000',
          sort: '-lastSeen',
          perPage: devicesPerPage,
        }),
        request('devices', base, {
          filter: 'lastSeen>=1000000000000',
          sort: '-lastSeen',
          perPage: devicesPerPage,
        }),
      ]);
      if (isStale(gen)) return;

      const device = selectWidgetDevice([...devicesSeconds, ...devicesMilliseconds]);
      if (!device) return;

      // The server's raw `-timestamp` sort mixes second- and millisecond-scale
      // acquisition times, so one scoped query can hide the true newest row
      // behind a page full of the other unit. Read each unit range as its own
      // query and merge the rows locally before selecting.
      const deviceFilter = `deviceId='${device.deviceId}'`;
      const secondsFilter = `${deviceFilter}&&timestamp<1000000000000`;
      const millisecondsFilter = `${deviceFilter}&&timestamp>=1000000000000`;

      const [telemetrySeconds, telemetryMilliseconds] = await Promise.all([
        request('telemetry', base, {
          filter: secondsFilter,
          sort: '-timestamp',
          perPage: telemetryPerPage,
        }),
        request('telemetry', base, {
          filter: millisecondsFilter,
          sort: '-timestamp',
          perPage: telemetryPerPage,
        }),
      ]);
      if (isStale(gen)) return;

      const [alertSeconds, alertMilliseconds] = await Promise.all([
        request('alerts', base, {
          filter: secondsFilter,
          sort: '-timestamp',
          perPage: alertsPerPage,
        }),
        request('alerts', base, {
          filter: millisecondsFilter,
          sort: '-timestamp',
          perPage: alertsPerPage,
        }),
      ]);
      if (isStale(gen)) return;

      const telemetry = [...telemetrySeconds, ...telemetryMilliseconds];
      const alerts = [...alertSeconds, ...alertMilliseconds];

      const frame = selectNewestTelemetry(telemetry, device.deviceId);
      const alert = selectNewestAlert(alerts, device.deviceId);
      const identity = resolveWidgetIdentity(frame, {
        deviceId: device.deviceId,
        deviceLabel: device.label,
      });

      const state = buildWidgetState({
        frame: frame as WidgetStateInput['frame'],
        alert,
        now: now(),
        theme: theme(),
        deviceId: identity.deviceId,
        deviceLabel: identity.deviceLabel,
      });

      await maybeWrite(state, gen);
    } catch (error) {
      if (isStale(gen)) return;
      // Error reporting must never break the poll: a throwing onError is
      // swallowed so the cycle still resolves and the cadence continues.
      try {
        onError(error);
      } catch {
        // Intentionally ignored.
      }
    }
  };

  const runCycle = (): Promise<void> => {
    const gen = generation;
    if (currentRun?.generation === gen) return currentRun.promise;

    const promise = cycle(gen);
    const entry = { generation: gen, promise };
    currentRun = entry;

    const finish = (): void => {
      // A stale generation must never clear or schedule over the fresh run
      // that replaced it during stop/start.
      if (currentRun !== entry) return;
      currentRun = null;
      if (active && generation === gen) scheduleNext();
    };
    void promise.then(finish, finish);

    return promise;
  };

  return {
    start(): void {
      if (active) return;
      disposed = false;
      active = true;
      generation += 1;
      void runCycle();
    },
    stop(): void {
      active = false;
      disposed = true;
      generation += 1;
      clearPollTimer();
      for (const handle of inflight) {
        cancelTimeout(handle.timer);
        handle.controller.abort();
      }
      inflight.clear();
    },
    refresh(): Promise<void> {
      if (disposed) return Promise.resolve();
      return runCycle();
    },
  };
}
