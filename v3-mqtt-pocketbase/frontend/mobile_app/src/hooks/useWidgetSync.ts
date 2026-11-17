/**
 * useWidgetSync — thin React/Expo adapter for the native Android widget.
 *
 * The actual work (source selection, one-device scoping, single-flight polling,
 * atomic cache writes, cancellation) lives in the already-tested React-free
 * runtime (`utils/widget-runtime`). This module only bridges the app to it:
 *
 *   - it dynamically imports expo-file-system, the farmer setup store and the
 *     PocketBase client, so nothing Expo/React-Native is loaded at import time
 *     (the lifecycle boundary stays plain-tsx testable);
 *   - it mounts exactly one runtime and tears it down on unmount, cancelling a
 *     startup that is still awaiting those dynamic imports;
 *   - it forwards the app's effective theme live (via a ref), accepting only a
 *     resolved 'light' | 'dark'.
 *
 * The React-free lifecycle helper exported below is what the tests drive; the
 * hook is deliberately a few lines on top of it.
 */

import { useEffect, useRef } from 'react';
import { createWidgetRuntime, type WidgetRuntime } from '../utils/widget-runtime';
import type { CreateExpoFile, ExpoFileLike, WidgetFetchImpl } from '../utils/widget-adapter';
import type { WidgetTheme } from '../utils/widget-state';

/** Canonical widget-cache filename read by the Kotlin AppWidgetProvider. */
export const WIDGET_STATE_FILENAME = 'pigpulse_widget_state.json';

/**
 * Resolve any incoming app theme to a widget theme. Only a resolved
 * 'light' | 'dark' is accepted; every other value (auto/system/undefined)
 * degrades to 'light'.
 */
export function toWidgetTheme(value: unknown): WidgetTheme {
  return value === 'dark' ? 'dark' : 'light';
}

/** The widget cache is native Android-only; other platforms never start it. */
export function isWidgetSyncPlatform(platform: string): boolean {
  return platform === 'android';
}

export interface WidgetSyncLifecycleDeps {
  /**
   * Build the runtime once the app's dynamic imports resolve. `getTheme` is the
   * live theme reader handed to the runtime.
   */
  createRuntime(getTheme: () => WidgetTheme): Promise<WidgetRuntime> | WidgetRuntime;
  /** Report startup failures; a throwing reporter never breaks lifecycle state. */
  onError?(error: unknown): void;
}

export interface WidgetSyncLifecycle {
  /** Begin startup (idempotent while already active). */
  start(): void;
  /** Cancel pending startup and stop the running runtime. */
  stop(): void;
  /** Update the theme the runtime reads at its next write. */
  setTheme(theme: WidgetTheme): void;
}

/**
 * React-free lifecycle controller for the widget runtime.
 *
 * `start()` runs the app's dynamic imports plus setup, then starts the runtime.
 * A generation guard means a `stop()` (or a stop/start) that lands while those
 * imports are still pending cancels the startup: the freshly built runtime is
 * stopped instead of started. `setTheme` mutates the value the runtime reads
 * live, so a theme change is reflected by the next write without a restart.
 */
export function createWidgetSyncLifecycle(deps: WidgetSyncLifecycleDeps): WidgetSyncLifecycle {
  let active = false;
  let generation = 0;
  let runtime: WidgetRuntime | null = null;
  let theme: WidgetTheme = 'light';

  const report = (error: unknown): void => {
    try {
      deps.onError?.(error);
    } catch {
      // Error reporting must never corrupt lifecycle state.
    }
  };

  const stopSafely = (target: WidgetRuntime): void => {
    try {
      target.stop();
    } catch (error) {
      report(error);
    }
  };

  return {
    start(): void {
      if (active) return;
      active = true;
      const gen = ++generation;

      void (async () => {
        let created: WidgetRuntime;
        try {
          created = await deps.createRuntime(() => theme);
        } catch (error) {
          report(error);
          return;
        }

        // Cleanup or a restart landed while the dynamic imports/setup were
        // pending: never start a runtime for a dead generation — cancel it.
        if (!active || gen !== generation) {
          stopSafely(created);
          return;
        }

        runtime = created;
        try {
          await created.start();
        } catch (error) {
          report(error);
        }
      })();
    },

    stop(): void {
      active = false;
      generation += 1;
      const current = runtime;
      runtime = null;
      if (current) stopSafely(current);
    },

    setTheme(next: WidgetTheme): void {
      theme = next === 'dark' ? 'dark' : 'light';
    },
  };
}

/**
 * Production runtime factory: performs the three dynamic imports at startup and
 * wires the React-free runtime to Expo, the setup store and PocketBase.
 */
async function createAppWidgetRuntime(
  getTheme: () => WidgetTheme,
  onError: (error: unknown) => void,
): Promise<WidgetRuntime> {
  const [FileSystem, setupStore, pocketbase] = await Promise.all([
    import('expo-file-system'),
    import('../utils/setupStore'),
    import('../utils/pocketbase'),
  ]);

  const createFile: CreateExpoFile = (path) =>
    new FileSystem.File(path) as unknown as ExpoFileLike;
  const targetPath = new FileSystem.File(FileSystem.Paths.document, WIDGET_STATE_FILENAME).uri;

  // Direct list fetch: pbList cannot carry a per-cycle base URL or AbortSignal,
  // and the realtime subscribe* feeders are deliberately not reused here.
  const fetchImpl: WidgetFetchImpl = (url, init) =>
    fetch(url, { signal: init.signal }) as unknown as ReturnType<WidgetFetchImpl>;

  return createWidgetRuntime({
    loadSetup: () => setupStore.loadFarmerSetup(),
    configureServer: (url) => pocketbase.setConfiguredServer(url),
    fetchImpl,
    createFile,
    targetPath,
    buildUrl: process.env.EXPO_PUBLIC_POCKETBASE_URL ?? '',
    hotspotUrl: pocketbase.PB_HOTSPOT_URL,
    theme: getTheme,
    onError,
  });
}

/**
 * Mount the widget sync for the lifetime of the calling component. Must be
 * called unconditionally inside the app's ThemeProvider; `mode` is the app's
 * effective colour scheme. Only Android starts the native widget runtime.
 */
export function useWidgetSync(
  mode: WidgetTheme | string | undefined,
  platform: string,
): void {
  // Live theme ref: React re-renders update it, and the runtime reads it through
  // the lifecycle so a change affects later writes without restarting polling.
  const themeRef = useRef<WidgetTheme>(toWidgetTheme(mode));
  const lifecycleRef = useRef<WidgetSyncLifecycle | null>(null);

  useEffect(() => {
    themeRef.current = toWidgetTheme(mode);
    lifecycleRef.current?.setTheme(themeRef.current);
  }, [mode]);

  useEffect(() => {
    if (!isWidgetSyncPlatform(platform)) return;

    const lifecycle = createWidgetSyncLifecycle({
      createRuntime: (getTheme) =>
        createAppWidgetRuntime(getTheme, (error) => {
          // eslint-disable-next-line no-console
          console.warn('[widget-sync] cycle failed:', error);
        }),
    });
    lifecycleRef.current = lifecycle;
    lifecycle.setTheme(themeRef.current);
    lifecycle.start();

    return () => {
      lifecycleRef.current = null;
      lifecycle.stop();
    };
  }, [platform]);
}
