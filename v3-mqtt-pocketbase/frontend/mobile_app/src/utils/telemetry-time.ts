/** Device acquisition time, never HTTP receipt time. */
export function telemetryTime(value: unknown): number {
  if (typeof value !== 'number' && typeof value !== 'string') return NaN;
  if (typeof value === 'string' && !value.trim()) return NaN;
  const numeric = Number(value);
  const time = Number.isFinite(numeric)
    ? (numeric < 1e12 ? numeric * 1000 : numeric)
    : Date.parse(String(value));
  return time > 0 ? time : NaN;
}

export function telemetryFresh(value: unknown, now = Date.now()): boolean {
  const age = now - telemetryTime(value);
  return Number.isFinite(age) && age >= -5000 && age <= 90000;
}
