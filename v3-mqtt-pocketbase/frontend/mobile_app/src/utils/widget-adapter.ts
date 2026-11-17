/**
 * React-free adapters that connect the widget poll controller's pure contracts
 * to the outside world: PocketBase over HTTP (fetch), the farmer's selected
 * local source (saved setup -> build -> hotspot), and the Expo file system.
 *
 * This module is deliberately free of React, React Native and Expo runtime
 * imports and performs no work at import time. Every external dependency is
 * injected (a fetch implementation, a setup loader, a `File` factory) so the
 * whole boundary can be exercised under the repository's plain tsx runner with
 * real adapters and fake dependencies. It imports only the pure `source-policy`
 * helper and type-only controller/sync contracts.
 */

import { chooseNativeSource } from './source-policy';
import type {
  WidgetPollListAdapter,
  WidgetPollListOptions,
  WidgetPollSourceProvider,
} from './widget-poll-controller';
import type { WidgetStateFileAdapter, WidgetSyncRecord } from './widget-sync';

/** Fetch surface the list adapter needs; compatible with global `fetch`. */
export type WidgetFetchImpl = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface WidgetListUrlOptions {
  filter?: string;
  sort?: string;
  perPage?: number;
}

/**
 * Build the exact PocketBase records URL for a list query.
 *
 * The base is normalised without a trailing slash; the fixed
 * `api/collections/<collection>/records` path follows; then `filter`, `sort`
 * and `perPage` are appended in that fixed order, skipped when undefined and
 * encoded by URLSearchParams so reserved characters survive verbatim.
 */
export function buildWidgetListUrl(
  baseUrl: string,
  collection: string,
  options: WidgetListUrlOptions = {},
): string {
  const base = baseUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (options.filter !== undefined) params.append('filter', options.filter);
  if (options.sort !== undefined) params.append('sort', options.sort);
  if (options.perPage !== undefined) params.append('perPage', String(options.perPage));
  const query = params.toString();
  const path = `${base}/api/collections/${collection}/records`;
  return query ? `${path}?${query}` : path;
}

/**
 * Wrap a fetch implementation as the controller's list adapter.
 *
 * The caller's `signal` is forwarded unchanged, the response body is consumed
 * before the promise resolves (so a request deadline stays armed through the
 * body read), and a non-OK response or a payload without an `items` array is
 * rejected.
 */
export function createWidgetListAdapter(fetchImpl: WidgetFetchImpl): WidgetPollListAdapter {
  return {
    async list(
      collection: string,
      options: WidgetPollListOptions,
    ): Promise<readonly WidgetSyncRecord[]> {
      const url = buildWidgetListUrl(options.baseUrl, collection, {
        filter: options.filter,
        sort: options.sort,
        perPage: options.perPage,
      });
      const response = await fetchImpl(url, { signal: options.signal });
      if (!response.ok) {
        throw new Error(`PocketBase list request failed with status ${response.status}`);
      }
      const payload = await response.json();
      const items = (payload as { items?: unknown } | null | undefined)?.items;
      if (!Array.isArray(items)) {
        throw new Error('PocketBase list response is missing an items array');
      }
      return items as WidgetSyncRecord[];
    },
  };
}

/** The persisted setup shape needed to read the saved PocketBase source. */
export type WidgetSetupSource = { pbUrl?: string | null } | null | undefined;
export type LoadWidgetSetup = () => WidgetSetupSource | Promise<WidgetSetupSource>;

export interface WidgetSourceProviderConfig {
  loadSetup: LoadWidgetSetup;
  buildUrl?: string | null;
  hotspotUrl: string;
}

/**
 * Resolve the ONE selected local source through the shared source policy.
 *
 * Precedence is saved setup -> build URL -> hotspot default, and a malformed
 * explicit saved source fails closed (resolves `null`) with no fallback.
 */
export function createWidgetSourceProvider(
  config: WidgetSourceProviderConfig,
): WidgetPollSourceProvider {
  return {
    async resolve(): Promise<string | null> {
      const setup = await config.loadSetup();
      const decision = chooseNativeSource({
        saved: setup?.pbUrl,
        build: config.buildUrl,
        piDefault: config.hotspotUrl,
      });
      return decision.base;
    },
  };
}

/** The subset of Expo's `File` the widget cache replacement uses. */
export interface ExpoFileLike {
  readonly exists: boolean;
  write(contents: string): void;
  move(destination: ExpoFileLike, options?: { overwrite?: boolean }): void | Promise<void>;
  delete(): void;
}

/** Factory that turns a path into an Expo `File` handle (no I/O at creation). */
export type CreateExpoFile = (path: string) => ExpoFileLike;

/**
 * Adapt an Expo `File` factory to the widget cache's file operations.
 *
 * `writeFile`/`moveFile` mirror `replaceWidgetStateFile`'s temp-then-move flow
 * and move with `{ overwrite: true }` so the canonical file is never
 * pre-deleted; `deleteFile` deletes only a file that actually exists.
 */
export function createExpoFileSystemAdapter(createFile: CreateExpoFile): WidgetStateFileAdapter {
  return {
    async writeFile(path: string, contents: string): Promise<void> {
      createFile(path).write(contents);
    },
    async moveFile(source: string, destination: string): Promise<void> {
      await createFile(source).move(createFile(destination), { overwrite: true });
    },
    async deleteFile(path: string): Promise<void> {
      const file = createFile(path);
      if (file.exists) file.delete();
    },
  };
}
