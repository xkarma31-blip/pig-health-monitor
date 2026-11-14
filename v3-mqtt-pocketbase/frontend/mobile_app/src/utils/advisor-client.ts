/**
 * Pure, dependency-free advisor CLIENT (B4 foundation).
 *
 * This module is an isolated foundation: it is NOT wired into the app, starts
 * no model or provider, holds no secrets, and only calls an INJECTED transport.
 * All network behaviour lives behind that injection so tests use fakes.
 *
 * Guarantees:
 *  - Offline help issues ZERO transport calls.
 *  - Local mode requires an explicitly available local runtime + transport; a
 *    local failure is `unavailable` and NEVER falls back to the cloud.
 *  - Cloud mode is disabled by default and requires enabled + destination +
 *    consent + transport, plus a nonempty trusted endpoint.
 *  - The request field allowlist (see advisor-contract) prevents secret/URL
 *    smuggling; the client also never injects credentials or headers.
 *  - SUPERSEDE SEMANTICS: every `send()` (any mode) first invalidates and
 *    cancels any preceding request BEFORE validation and BEFORE the offline /
 *    disabled / unavailable early returns. So a newer send — including a switch
 *    to offline or a rejected request — always cancels the one before it.
 *  - A pre-aborted external signal issues ZERO transport calls.
 *  - Exactly one cancellable, full-body deadline controller per request. The
 *    deadline races BOTH the transport call and the full-body `text()` read,
 *    and timeout/cancel are classified consistently (never masked as
 *    `upstream`). The deadline uses an injectable clock so tests never use real
 *    long timers. There is NO automatic retry.
 */

import {
  ADVISOR_CONTRACT_VERSION,
  type AdvisorError,
  type AdvisorErrorCode,
  type AdvisorMessage,
  type AdvisorMode,
  validateAdvisorReply,
  validateAdvisorRequest,
} from './advisor-contract';
import { getOfflineHelp } from './offline-advisor';

export interface AdvisorTransportResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export interface AdvisorTransportInit {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}

export type AdvisorTransport = (endpoint: string, init: AdvisorTransportInit) => Promise<AdvisorTransportResponse>;

export interface AdvisorClock {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AdvisorLocalConfig {
  available: boolean;
  endpoint?: string;
}

export interface AdvisorCloudConfig {
  enabled: boolean;
  destination?: string;
  consent?: boolean;
  endpoint?: string;
}

export interface AdvisorClientConfig {
  transport?: AdvisorTransport;
  local?: AdvisorLocalConfig;
  cloud?: AdvisorCloudConfig;
  timeoutMs?: number;
  clock?: AdvisorClock;
}

export interface AdvisorResponse {
  mode: AdvisorMode;
  engine: string;
  reply: string;
}

export type AdvisorResult = { ok: true; response: AdvisorResponse } | { ok: false; error: AdvisorError };

export interface AdvisorSendOptions {
  signal?: AbortSignal;
}

export interface AdvisorClient {
  send(raw: unknown, options?: AdvisorSendOptions): Promise<AdvisorResult>;
  cancel(): void;
}

const DEFAULT_TIMEOUT_MS = 8000;
/** Upper bound so a huge/non-finite `timeoutMs` cannot disable the deadline. */
const MAX_TIMEOUT_MS = 60_000;
const LOCAL_FALLBACK_ENDPOINT = 'local://advisor';

/**
 * Resolve a configured timeout to a finite, positive, capped value. Anything
 * missing, non-numeric, non-finite, or non-positive falls back to the default,
 * and every accepted value is capped so the deadline can never be disabled.
 */
function resolveTimeoutMs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(value, MAX_TIMEOUT_MS);
}

const defaultClock: AdvisorClock = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const ENGINE_BY_MODE: Record<AdvisorMode, string> = {
  offline: 'offline-help',
  local: 'local-ai',
  cloud: 'cloud-ai',
};

function error(code: AdvisorErrorCode, message: string): AdvisorError {
  return { code, message };
}

function mapStatus(status: number): AdvisorErrorCode {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate';
  return 'upstream';
}

/**
 * Trusted-config endpoint resolution. An explicitly supplied endpoint must be a
 * nonempty string: an explicitly empty string is REJECTED (returns null) rather
 * than silently falling back to the destination or to a relative `''` URL.
 */
function resolveEndpoint(explicit: string | undefined, fallback: string): string | null {
  const value = explicit === undefined ? fallback : explicit;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function lastUserContent(messages: AdvisorMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') return messages[index].content;
  }
  return messages.length > 0 ? messages[messages.length - 1].content : '';
}

class AdvisorAbort extends Error {}

interface RequestScope {
  controller: AbortController;
  aborted: Promise<never>;
  timedOut: boolean;
  abort(reason: 'timeout' | 'cancelled'): void;
  cleanup(): void;
}

function createScope(clock: AdvisorClock, timeoutMs: number): RequestScope {
  const controller = new AbortController();
  let rejectAbort: (reason: unknown) => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    rejectAbort = reject;
  });
  // A supersede/cancel can fire after the race has already settled; keep the
  // rejection handled so it never becomes an unhandled promise rejection.
  void aborted.catch(() => {});

  let settled = false;
  const scope: RequestScope = {
    controller,
    aborted,
    timedOut: false,
    abort(reason) {
      if (settled) return;
      settled = true;
      scope.timedOut = reason === 'timeout';
      controller.abort();
      rejectAbort(new AdvisorAbort(reason));
    },
    cleanup() {
      settled = true;
      clock.clearTimeout(handle);
    },
  };
  const handle = clock.setTimeout(() => scope.abort('timeout'), timeoutMs);
  return scope;
}

/**
 * Create a stateful advisor client over an injected transport. The client owns
 * a single in-flight request; it never owns a provider, secret or URL.
 */
export function createAdvisorClient(config: AdvisorClientConfig = {}): AdvisorClient {
  const timeoutMs = resolveTimeoutMs(config.timeoutMs);
  const clock = config.clock ?? defaultClock;

  let generation = 0;
  let inFlight: RequestScope | null = null;

  /**
   * Cancel and forget the in-flight request and advance the generation so any
   * late completion of a superseded request is ignored. Returns the new
   * generation to tag the caller's own request with.
   */
  function invalidateInFlight(): number {
    generation += 1;
    if (inFlight) {
      const scope = inFlight;
      inFlight = null;
      scope.abort('cancelled');
    }
    return generation;
  }

  function cancel(): void {
    invalidateInFlight();
  }

  async function send(raw: unknown, options: AdvisorSendOptions = {}): Promise<AdvisorResult> {
    // Every send — any mode, valid or not — invalidates the request before it,
    // BEFORE validation and the offline/disabled/unavailable early returns.
    const myGeneration = invalidateInFlight();

    const validated = validateAdvisorRequest(raw);
    if (!validated.ok) return { ok: false, error: validated.error };
    const request = validated.request;

    // Offline help is fully local; it never touches the transport.
    if (request.mode === 'offline') {
      return {
        ok: true,
        response: {
          mode: 'offline',
          engine: ENGINE_BY_MODE.offline,
          reply: getOfflineHelp(lastUserContent(request.messages)),
        },
      };
    }

    let endpoint: string | null;
    if (request.mode === 'local') {
      if (!config.local || config.local.available !== true || !config.transport) {
        return { ok: false, error: error('unavailable', 'Pi-local AI is not available.') };
      }
      endpoint = resolveEndpoint(config.local.endpoint, LOCAL_FALLBACK_ENDPOINT);
      if (endpoint === null) {
        return { ok: false, error: error('unavailable', 'Pi-local AI has no usable endpoint.') };
      }
    } else {
      const cloud = config.cloud;
      if (!cloud || cloud.enabled !== true || !cloud.destination || cloud.consent !== true || !config.transport) {
        return { ok: false, error: error('disabled', 'Cloud AI is not enabled.') };
      }
      endpoint = resolveEndpoint(cloud.endpoint, cloud.destination);
      if (endpoint === null) {
        return { ok: false, error: error('disabled', 'Cloud AI has no usable endpoint.') };
      }
    }

    // A pre-aborted external signal must issue ZERO transport calls.
    if (options.signal && options.signal.aborted) {
      return { ok: false, error: error('cancelled', 'The request was cancelled.') };
    }

    const transport = config.transport as AdvisorTransport;

    const scope = createScope(clock, timeoutMs);
    inFlight = scope;

    let detachSignal = () => {};
    if (options.signal) {
      const external = options.signal;
      const onExternalAbort = () => scope.abort('cancelled');
      external.addEventListener('abort', onExternalAbort);
      detachSignal = () => external.removeEventListener('abort', onExternalAbort);
    }

    const payload: Record<string, unknown> = {
      version: ADVISOR_CONTRACT_VERSION,
      mode: request.mode,
      messages: request.messages,
    };

    const settledError = () =>
      error(scope.timedOut ? 'timeout' : 'cancelled', scope.timedOut ? 'The request timed out.' : 'The request was cancelled.');

    try {
      // Race the transport call against the deadline (header phase).
      const response = await Promise.race([
        transport(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: scope.controller.signal,
        }),
        scope.aborted,
      ]);

      if (myGeneration !== generation || scope.controller.signal.aborted) return { ok: false, error: settledError() };
      if (!response.ok) {
        return { ok: false, error: error(mapStatus(response.status), `The advisor request failed (${response.status}).`) };
      }

      // Race the full-body read against the deadline too, so a body stall or an
      // abort-triggered body error is classified as timeout/cancelled and is
      // never masked as `upstream`.
      let text: string;
      try {
        text = await Promise.race([response.text(), scope.aborted]);
      } catch (caught) {
        if (caught instanceof AdvisorAbort || scope.controller.signal.aborted || myGeneration !== generation) {
          return { ok: false, error: settledError() };
        }
        return { ok: false, error: error('upstream', 'The advisor reply could not be read.') };
      }
      if (myGeneration !== generation || scope.controller.signal.aborted) return { ok: false, error: settledError() };

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return { ok: false, error: error('upstream', 'The advisor reply was malformed.') };
      }

      const reply = validateAdvisorReply(parsed);
      if (!reply.ok) return { ok: false, error: reply.error };

      return {
        ok: true,
        response: { mode: request.mode, engine: ENGINE_BY_MODE[request.mode], reply: reply.reply },
      };
    } catch (caught) {
      if (caught instanceof AdvisorAbort) return { ok: false, error: settledError() };
      if (scope.controller.signal.aborted) return { ok: false, error: settledError() };
      return { ok: false, error: error('upstream', 'The advisor request failed.') };
    } finally {
      detachSignal();
      scope.cleanup();
      if (inFlight === scope) inFlight = null;
    }
  }

  return { send, cancel };
}
