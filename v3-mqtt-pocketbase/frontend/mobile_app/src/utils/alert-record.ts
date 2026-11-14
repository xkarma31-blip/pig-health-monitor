/**
 * Pure alert record classification (B5 Alerts).
 *
 * Dependency-free on purpose: importable by tests under the repo's tsx runner
 * and by the screen, with no React/theme coupling.
 *
 * Honesty rules (EXPANDED_APP_DESIGN Figure 3):
 *   - A device/system row such as MIC_DISCONNECTED is a `system` event, never
 *     guessed to be thermal.
 *   - An unrecognised or missing type is retained as `unknown` and its raw
 *     token kept for display; it is never promoted to thermal.
 *   - An unrecognised severity is retained visibly, not silently mapped.
 */

export type AlertStatus = 'alert' | 'watch' | 'info';
export type AlertKind = 'thermal' | 'sound' | 'system' | 'unknown';

export type SeverityClass = {
  status: AlertStatus;
  /** Badge label. */
  label: string;
  /** True only for a recognised severity token. */
  recognized: boolean;
  /** Normalised (uppercase) token, '' when missing. */
  token: string;
};

export type KindClass = {
  kind: AlertKind;
  /** Raw type token preserved for display/inspection. */
  token: string;
};

export type AlertItem = {
  id: string;
  status: AlertStatus;
  label: string;
  kind: AlertKind;
  typeToken: string;
  severityToken: string;
  severityRecognized: boolean;
  message: string;
  /** Optional capture frame (data URL or URL) captured when the alert fired. */
  frame?: string;
};

const SEVERITY_MAP: Record<string, AlertStatus> = {
  CRITICAL: 'alert',
  HIGH: 'alert',
  ALERT: 'alert',
  SEVERE: 'alert',
  WARNING: 'watch',
  ELEVATED: 'watch',
  WATCH: 'watch',
  MEDIUM: 'watch',
  INFO: 'info',
  LOW: 'info',
  NORMAL: 'info',
  NOTICE: 'info',
};

const STATUS_LABEL: Record<AlertStatus, string> = {
  alert: 'Critical',
  watch: 'Warning',
  info: 'Info',
};

/** Device/system tokens win over sound/thermal so MIC_DISCONNECTED is not thermal. */
const SYSTEM_RE = /(mic[_-]?disconnect|disconnect|offline|unavailable|fault|failure|system|device|node|power|error)/;
const SOUND_RE = /(sound|audio|acoustic|cough|squeal|respir|noise)/;
const THERMAL_RE = /(thermal|temperature|temp|fever|heat)/;

function rawToken(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function classifySeverity(raw: unknown): SeverityClass {
  const token = rawToken(raw).toUpperCase();
  if (!token) return { status: 'info', label: 'Unclassified', recognized: false, token };
  const status = SEVERITY_MAP[token];
  if (status) return { status, label: STATUS_LABEL[status], recognized: true, token };
  // Unrecognised severity: keep it visible, do not guess a class.
  return { status: 'info', label: `Unknown (${token})`, recognized: false, token };
}

export function classifyKind(rawType: unknown): KindClass {
  const token = rawToken(rawType);
  const lower = token.toLowerCase();
  if (!lower) return { kind: 'unknown', token };
  if (SYSTEM_RE.test(lower)) return { kind: 'system', token };
  if (SOUND_RE.test(lower)) return { kind: 'sound', token };
  if (THERMAL_RE.test(lower)) return { kind: 'thermal', token };
  return { kind: 'unknown', token };
}

const KIND_LABEL: Record<AlertKind, string> = {
  thermal: 'Thermal',
  sound: 'Sound',
  system: 'System',
  unknown: 'Unknown',
};

export function kindLabel(kind: AlertKind): string {
  return KIND_LABEL[kind] ?? 'Unknown';
}

/**
 * Visible type string for the Alerts screen: the classified kind plus the raw
 * type token, so an unrecognised row still shows exactly what it said. Missing
 * token renders the kind alone (never a fabricated token).
 */
export function typeDisplay(item: AlertItem): string {
  const label = kindLabel(item.kind);
  return item.typeToken ? `${label} · ${item.typeToken}` : label;
}

export function alertMessage(record: Record<string, unknown>): string {
  for (const key of ['message', 'description', 'title'] as const) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  const token = rawToken(record.type ?? record.source);
  return token ? `${token} event recorded` : 'Alert recorded';
}

export function mapAlert(id: string, record: Record<string, unknown>): AlertItem {
  const severity = classifySeverity(record.severity ?? record.level ?? record.status);
  const kind = classifyKind(record.type ?? record.source);
  return {
    id,
    status: severity.status,
    label: severity.label,
    kind: kind.kind,
    typeToken: kind.token,
    severityToken: severity.token,
    severityRecognized: severity.recognized,
    message: alertMessage(record),
    frame: typeof record.frame === 'string' && record.frame.trim() ? record.frame : undefined,
  };
}
