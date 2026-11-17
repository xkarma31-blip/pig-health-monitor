/**
 * React-free runtime composition for the native Android home-screen widget.
 *
 * This module wires the farmer's saved setup, direct PocketBase HTTP, the Expo
 * file system and the polling controller together. It owns no React, React
 * Native or Expo runtime imports, so startup, source selection, theme changes
 * and cleanup remain verifiable under the repository's plain tsx runner.
 */

import {
  createExpoFileSystemAdapter,
  createWidgetListAdapter,
  createWidgetSourceProvider,
  type CreateExpoFile,
  type LoadWidgetSetup,
  type WidgetFetchImpl,
  type WidgetSetupSource,
} from './widget-adapter';
import {
  createWidgetPollController,
  type WidgetPollController,
} from './widget-poll-controller';
import type { WidgetTheme } from './widget-state';

export interface WidgetRuntimeOptions {
  /** Read the farmer's persisted setup, including the selected PB source. */
  loadSetup: LoadWidgetSetup;
  /** Install the selected source in the shared PocketBase client. */
  configureServer: (url: string | null | undefined) => void;
  /** Direct list fetch; `pbList` cannot carry a per-cycle base URL/signal. */
  fetchImpl: WidgetFetchImpl;
  /** Create an Expo file handle for a path without performing I/O. */
  createFile: CreateExpoFile;
  /** Canonical widget-cache path in Expo's document directory. */
  targetPath: string;
  /** Optional build-time source, below saved setup and above the hotspot. */
  buildUrl?: string | null;
  /** Final native fallback: the Pi hotspot's PocketBase origin. */
  hotspotUrl: string;
  /** Read the app's effective light/dark theme live for every cycle. */
  theme: () => WidgetTheme;
  now?: () => number;
  onError?: (error: unknown) => void;
  intervalMs?: number;
  deadlineMs?: number;
}

export interface WidgetRuntime {
  /** Install saved setup, then begin polling. Safe to call more than once. */
  start(): Promise<void>;
  /** Cancel pending startup, timers and in-flight requests. */
  stop(): void;
  /** Run one deterministic cycle now (no-op before start or after stop). */
  refresh(): Promise<void>;
}

export function createWidgetRuntime(options: WidgetRuntimeOptions): WidgetRuntime {
  let active = false;
  let generation = 0;

  const report = (error: unknown): void => {
    try {
      options.onError?.(error);
    } catch {
      // Error reporting must never break the widget's poll cadence.
    }
  };

  const loadAndConfigureSetup = async (): Promise<WidgetSetupSource> => {
    const setup = await options.loadSetup();
    options.configureServer(setup?.pbUrl ?? null);
    return setup;
  };

  const source = createWidgetSourceProvider({
    loadSetup: loadAndConfigureSetup,
    buildUrl: options.buildUrl,
    hotspotUrl: options.hotspotUrl,
  });
  const list = createWidgetListAdapter(options.fetchImpl);
  const files = createExpoFileSystemAdapter(options.createFile);

  const controller: WidgetPollController = createWidgetPollController({
    list,
    files,
    targetPath: options.targetPath,
    source,
    now: options.now,
    theme: options.theme,
    onError: report,
    intervalMs: options.intervalMs,
    deadlineMs: options.deadlineMs,
  });

  return {
    async start(): Promise<void> {
      if (active) return;
      active = true;
      const startGeneration = ++generation;

      try {
        // The shared PocketBase client must know the saved source before the
        // controller's first cycle starts. The source provider repeats this
        // read each cycle so a setup change takes effect without a restart.
        await loadAndConfigureSetup();
      } catch (error) {
        report(error);
      }

      if (!active || startGeneration !== generation) return;
      controller.start();
    },

    stop(): void {
      active = false;
      generation += 1;
      controller.stop();
    },

    refresh(): Promise<void> {
      if (!active) return Promise.resolve();
      return controller.refresh();
    },
  };
}
