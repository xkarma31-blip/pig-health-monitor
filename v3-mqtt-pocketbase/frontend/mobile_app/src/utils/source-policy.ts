/**
 * PigPulse source policy — one selected local source.
 *
 * Single place that decides WHICH local host the app talks to, for both the
 * PocketBase data client and the Pi thermal console. Pure + dependency-free so
 * it can be unit-tested without the React Native runtime.
 *
 * Rules (see PLAN_SOURCE_POLICY_NEXT.md):
 *   - Native order is saved setup → build-time env → Pi hotspot default.
 *     There is NO implicit Vercel, laptop-loopback or second-box fallback.
 *   - A malformed EXPLICIT source is fail-closed: it is surfaced, never silently
 *     replaced by a lower-priority source.
 *   - The Pi thermal console derives its host from the SAME selected PB source
 *     (no hosted bridge).
 *   - Web is always same-origin (`/api/pi`): a stale saved native host or a
 *     cross-origin override must never leak into a browser deployment.
 *   - HTTP(S) only, no userinfo / query / fragment / path. Parsing is
 *     hand-rolled (no `new URL`) because Hermes has shipped a partial URL shim,
 *     and bracket-aware so IPv6 literals survive.
 */

export type UrlScheme = 'http' | 'https';

export interface ParsedHttpBase {
  /** Normalised base: `scheme://authority`, no trailing slash, no path. */
  url: string;
  scheme: UrlScheme;
  /** Host without brackets (IPv6 literal has no `[]`). */
  host: string;
  /** Explicit port, or null when the source omitted one. */
  port: number | null;
  isIpv6: boolean;
}

export type ParseHttpBaseResult =
  | { ok: true; parsed: ParsedHttpBase }
  | { ok: false; reason: string };

export type SourceKind =
  | 'saved'
  | 'build'
  | 'bench'
  | 'pi-default'
  | 'local'
  | 'remote'
  | 'offline'
  | 'malformed'
  | 'web-same-origin';

export interface SourceDecision {
  /** Selected base, or null when the explicit configuration is malformed. */
  base: string | null;
  kind: SourceKind;
  /** True when an explicit source was present but rejected. */
  malformed: boolean;
  /** True when the source came from explicit operator configuration. */
  explicit: boolean;
}

export interface NativeSourceInput {
  saved?: string | null;
  build?: string | null;
  piDefault: string;
}

export interface ThermalDeriveOptions {
  scheme?: UrlScheme;
  /** Thermal console port; the Pi serves TLS on :8080. */
  port?: number;
}

export interface ParsedThermalBase {
  url: string;
  scheme: UrlScheme;
  host: string;
  port: number;
  isIpv6: boolean;
}

export type DeriveThermalResult =
  | { ok: true; parsed: ParsedThermalBase }
  | { ok: false; reason: string };

export interface ThermalSourceInput {
  isWeb: boolean;
  explicitOverride?: string | null;
  pbDecision: SourceDecision;
}

export interface ThermalDecision {
  base: string | null;
  kind: 'web-same-origin' | 'explicit' | 'derived' | 'malformed';
  malformed: boolean;
}

/** Local-first access policy. Remote is the same Pi over an encrypted tunnel. */
export type AccessMode = 'local' | 'remote' | 'auto';

export interface AccessSourceInput {
  mode: AccessMode;
  localBase: string | null | undefined;
  remoteBase: string | null | undefined;
  localReachable: boolean;
  remoteReachable: boolean;
}

export interface AccessDecision {
  base: string | null;
  kind: 'local' | 'remote' | 'offline' | 'malformed';
  reason: string;
}

/**
 * Strict dotted-quad IPv4 test. Rejects out-of-range octets such as
 * `999.999.999.999` and leading-zero octets (`01`) that WHATWG treats as octal.
 */
function isValidIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255);
}

/**
 * Strict bracketed IPv6 test (no zone id; optional trailing embedded IPv4).
 * Rejects the shapes the previous `[0-9a-fA-F:.]+` check let through — `:::`,
 * `1:2` (too few groups) and `1:2:3:4:5:6:7:8:9` (too many) — while accepting
 * `::1`, `fe80::1`, `1:2:3:4:5:6:7:8` and `::ffff:192.168.1.1`.
 */
function isValidIpv6(host: string): boolean {
  if (!host) return false;
  const halves = host.split('::');
  if (halves.length > 2) return false; // more than one '::'
  const countGroups = (side: string): number | null => {
    if (side === '') return 0;
    const groups = side.split(':');
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i];
      const isLast = i === groups.length - 1;
      if (isLast && g.includes('.')) {
        if (!isValidIpv4(g)) return null; // embedded IPv4 only as the last group
      } else if (!/^[0-9a-fA-F]{1,4}$/.test(g)) {
        return null;
      }
    }
    return groups.length;
  };
  const left = countGroups(halves[0]);
  if (left === null) return false;
  if (halves.length === 1) return left === 8; // no elision ⇒ exactly eight groups
  const right = countGroups(halves[1]);
  if (right === null) return false;
  return left + right <= 7; // '::' must stand for at least one zero group
}

/**
 * Strict HTTP(S) base parser. Rejects empty/whitespace, any non-http(s) scheme,
 * userinfo, query, fragment, paths, whitespace, unbracketed multi-colon hosts
 * and out-of-range ports. IPv6 literals must be bracketed and well-formed
 * (`http://[::1]:8090`); numeric hosts must be a real dotted-quad IPv4.
 */
export function parseHttpBase(input: string | null | undefined): ParseHttpBaseResult {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) return { ok: false, reason: 'empty' };
  const m = /^(https?):\/\//i.exec(raw);
  if (!m) return { ok: false, reason: 'missing http(s) scheme' };
  const scheme = m[1].toLowerCase() as UrlScheme;

  let rest = raw.slice(m[0].length);
  if (rest.includes('@')) return { ok: false, reason: 'userinfo not allowed' };
  if (rest.includes('?')) return { ok: false, reason: 'query not allowed' };
  if (rest.includes('#')) return { ok: false, reason: 'fragment not allowed' };
  if (/\s/.test(rest)) return { ok: false, reason: 'whitespace not allowed' };
  // Tolerate one trailing slash (normalised away); reject any other path.
  rest = rest.replace(/\/+$/, '');
  if (rest.includes('/')) return { ok: false, reason: 'path not allowed' };
  if (!rest) return { ok: false, reason: 'missing host' };

  let host: string;
  let portStr: string | null = null;
  let isIpv6 = false;

  if (rest.startsWith('[')) {
    const close = rest.indexOf(']');
    if (close < 0) return { ok: false, reason: 'unterminated IPv6 literal' };
    host = rest.slice(1, close);
    const after = rest.slice(close + 1);
    if (after) {
      if (!after.startsWith(':')) return { ok: false, reason: 'junk after IPv6 literal' };
      portStr = after.slice(1);
    }
    isIpv6 = true;
    if (!isValidIpv6(host)) return { ok: false, reason: 'invalid IPv6 literal' };
  } else {
    const parts = rest.split(':');
    if (parts.length > 2) return { ok: false, reason: 'invalid host/port' };
    host = parts[0];
    portStr = parts.length === 2 ? parts[1] : null;
    if (!host) return { ok: false, reason: 'missing host' };
    if (/^[\d.]+$/.test(host)) {
      // Purely numeric-and-dotted hosts must be a real IPv4 literal; this
      // rejects `999.999.999.999`, which WHATWG also refuses.
      if (!isValidIpv4(host)) return { ok: false, reason: 'invalid IPv4 host' };
    } else if (
      !/^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*$/.test(host)
    ) {
      return { ok: false, reason: 'invalid host' };
    }
  }

  let port: number | null = null;
  if (portStr !== null) {
    if (!/^\d+$/.test(portStr)) return { ok: false, reason: 'invalid port' };
    const n = Number(portStr);
    if (!Number.isInteger(n) || n < 1 || n > 65535) return { ok: false, reason: 'port out of range' };
    port = n;
  }

  const authority = isIpv6
    ? `[${host}]${port !== null ? `:${port}` : ''}`
    : `${host}${port !== null ? `:${port}` : ''}`;
  return { ok: true, parsed: { url: `${scheme}://${authority}`, scheme, host, port, isIpv6 } };
}

/** Loopback / localhost hosts are bench-only development sources. */
function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '::1' || host === '0.0.0.0' || /^127\./.test(host);
}

function classifyExplicit(base: string, kind: 'saved' | 'build'): SourceDecision {
  const parsed = parseHttpBase(base);
  if (!parsed.ok) return { base: null, kind: 'malformed', malformed: true, explicit: true };
  return {
    base: parsed.parsed.url,
    kind: isLoopbackHost(parsed.parsed.host) ? 'bench' : kind,
    malformed: false,
    explicit: true,
  };
}

/**
 * Native selection: saved setup → build-time env → Pi hotspot default. A
 * malformed explicit source fails closed (base null) rather than falling
 * through to the next tier.
 */
export function chooseNativeSource(input: NativeSourceInput): SourceDecision {
  const saved = (input.saved ?? '').trim();
  const build = (input.build ?? '').trim();
  if (saved) return classifyExplicit(saved, 'saved');
  if (build) return classifyExplicit(build, 'build');
  const def = parseHttpBase(input.piDefault);
  if (!def.ok) return { base: null, kind: 'malformed', malformed: true, explicit: false };
  return { base: def.parsed.url, kind: 'pi-default', malformed: false, explicit: false };
}

/** Derive the Pi thermal console base from the selected PB host (IPv6 safe). */
export function deriveThermalBaseFromPb(
  pbBase: string,
  opts: ThermalDeriveOptions = {},
): DeriveThermalResult {
  const parsed = parseHttpBase(pbBase);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const scheme: UrlScheme = opts.scheme ?? 'https';
  const port = opts.port ?? 8080;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: 'invalid thermal port' };
  }
  const authority = parsed.parsed.isIpv6
    ? `[${parsed.parsed.host}]:${port}`
    : `${parsed.parsed.host}:${port}`;
  return {
    ok: true,
    parsed: { url: `${scheme}://${authority}`, scheme, host: parsed.parsed.host, port, isIpv6: parsed.parsed.isIpv6 },
  };
}

/**
 * Thermal console base. Web is ALWAYS same-origin (`/api/pi`) — a cross-origin
 * override is refused and a stale saved native host is ignored. Native derives
 * from the same selected PB decision unless an explicit override is given.
 */
export function chooseThermalSource(input: ThermalSourceInput): ThermalDecision {
  const override = (input.explicitOverride ?? '').trim();

  if (input.isWeb) {
    // Web is ALWAYS the fixed same-origin path. Arbitrary override paths are
    // not honoured: a value like `/\outside.invalid/api/pi` is folded to
    // `//outside.invalid/api/pi` by WHATWG URL parsing (backslash == slash for
    // special schemes), i.e. a protocol-relative cross-origin fetch. Refusing
    // every override — rather than re-implementing URL normalisation — is the
    // only airtight way to keep a browser deployment same-origin.
    return { base: '/api/pi', kind: 'web-same-origin', malformed: false };
  }

  if (override) {
    const parsed = parseHttpBase(override);
    if (!parsed.ok) return { base: null, kind: 'malformed', malformed: true };
    return { base: parsed.parsed.url, kind: 'explicit', malformed: false };
  }

  if (input.pbDecision.malformed || !input.pbDecision.base) {
    return { base: null, kind: 'malformed', malformed: true };
  }
  const derived = deriveThermalBaseFromPb(input.pbDecision.base, { scheme: 'https', port: 8080 });
  if (!derived.ok) return { base: null, kind: 'malformed', malformed: true };
  return { base: derived.parsed.url, kind: 'derived', malformed: false };
}

/**
 * Pick the one PocketBase source for this session.
 *
 * Local is preferred. A remote URL is the SAME Pi reached over Tailscale/WireGuard,
 * never a cloud mirror or a second box. When both paths are down we fail closed
 * with an explicit recommendation to reconnect to the PigPulse hotspot.
 */
export function chooseAccessSource(input: AccessSourceInput): AccessDecision {
  const localRaw = (input.localBase ?? '').trim();
  const remoteRaw = (input.remoteBase ?? '').trim();

  if (input.mode === 'remote') {
    if (!remoteRaw) {
      return { base: null, kind: 'offline', reason: 'Remote access is not configured — reconnect to PigPulse hotspot' };
    }
    const remote = parseHttpBase(remoteRaw);
    if (!remote.ok) return { base: null, kind: 'malformed', reason: `Remote URL is invalid (${remote.reason})` };
    if (!input.remoteReachable) {
      return { base: null, kind: 'offline', reason: 'Pi is offline on the tunnel — reconnect to PigPulse hotspot' };
    }
    return { base: remote.parsed.url, kind: 'remote', reason: 'Using encrypted tunnel to the same Pi' };
  }

  const local = parseHttpBase(localRaw);
  if (!local.ok) return { base: null, kind: 'malformed', reason: `Local PocketBase URL is invalid (${local.reason})` };

  if (input.mode === 'local' || input.localReachable) {
    return { base: local.parsed.url, kind: 'local', reason: 'Using the PigPulse hotspot' };
  }

  if (remoteRaw && input.remoteReachable) {
    const remote = parseHttpBase(remoteRaw);
    if (remote.ok) {
      return { base: remote.parsed.url, kind: 'remote', reason: 'Pi is away — using encrypted tunnel to the same Pi' };
    }
    return { base: null, kind: 'offline', reason: `Remote URL is invalid (${remote.reason}) — reconnect to PigPulse hotspot` };
  }

  return { base: null, kind: 'offline', reason: 'Pi is offline — reconnect to PigPulse hotspot or try the encrypted tunnel' };
}
