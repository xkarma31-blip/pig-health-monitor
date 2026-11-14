/**
 * Pure device record mapping (B5 Settings).
 *
 * Dependency-free on purpose: importable by tests under the repo's tsx runner
 * and by the screen, with no React/theme coupling.
 *
 * Honesty rules (EXPANDED_APP_DESIGN Figure 5):
 *   - Missing firmware / RSSI / power / timestamp are explicit `null`, never invented.
 *   - Unknown acquisition time is UNKNOWN freshness — a screen must not call a
 *     device offline from the absence of a reading, nor from an old reading it
 *     cannot attribute to a verified clock.
 *   - Unknown numeric readings are explicit NaN, never a normal-looking 0.
 */

/** Explicit "no reading" sentinel — a finite 0 is a real value, NaN is not. */
export const UNKNOWN_READING: number = NaN;

/** Freshness tri-state: no time reported vs recent vs known-but-old. */
export type Freshness = 'unknown' | 'recent' | 'stale';

export type DeviceFields = {
  id: string;
  name: string;
  /** null = not reported by the device. */
  firmware: string | null;
  /** null = not reported / not a finite number. */
  rssiDbm: number | null;
  /** Device-reported power/battery string, null when the device reported none. */
  power: string | null;
  /** Device-reported acquisition time, raw. Pass to telemetryTime at the screen boundary. */
  lastSeenRaw: unknown;
};

/** A finite number is a real reading; NaN/Infinity/strings are not. */
export function hasReading(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value);
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function toFirmware(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw : null;
}

function toRssi(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim()) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toDeviceFields(raw: Record<string, unknown>, fallbackId = 'device'): DeviceFields {
  const id = firstNonEmpty(raw.id, raw.deviceId) ?? fallbackId;
  const name = firstNonEmpty(raw.name, raw.label, raw.deviceId, raw.id) ?? id;
  return {
    id,
    name,
    firmware: toFirmware(raw.firmware),
    rssiDbm: toRssi(raw.rssi),
    power: firstNonEmpty(raw.power, raw.battery),
    lastSeenRaw: raw.lastUpdated ?? raw.lastSeen ?? null,
  };
}

export function formatFirmware(firmware: string | null): string {
  return firmware ?? 'unknown';
}

export function formatRssi(rssiDbm: number | null): string {
  return rssiDbm === null ? '—' : `${rssiDbm} dBm`;
}

/** Device-reported power, or '—' when none was reported. Never invents "Plugged". */
export function formatPower(power: string | null): string {
  return power ?? '—';
}

/**
 * Freshness from a device-reported acquisition time:
 *   - 'unknown' when no usable time was reported (null / non-finite);
 *   - 'recent'  when the time is within [now - staleMs, now + skew tolerance];
 *   - 'stale'   when a known time is older than staleMs (or far future).
 *
 * 'stale' means only "not recently reported" — it is NOT proof the hardware is
 * offline, and no screen may claim that from this alone.
 */
export function deviceFreshness(lastSeenMs: number | null, now: number, staleMs: number): Freshness {
  if (lastSeenMs === null || !Number.isFinite(lastSeenMs)) return 'unknown';
  const age = now - lastSeenMs;
  return age >= -5000 && age <= staleMs ? 'recent' : 'stale';
}

export function freshnessLabel(freshness: Freshness): string {
  if (freshness === 'recent') return 'Active';
  if (freshness === 'stale') return 'Not recently seen';
  return 'Unknown';
}

/**
 * Boolean convenience over `deviceFreshness`. Only 'recent' reads online:
 * both an unknown time and a known-but-old one read false.
 */
export function deviceOnline(lastSeenMs: number | null, now: number, staleMs: number): boolean {
  return deviceFreshness(lastSeenMs, now, staleMs) === 'recent';
}
