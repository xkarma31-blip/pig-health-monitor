/**
 * Honest, testable wording for Pi thermal frames and verdicts.
 *
 * The MLX90640 measures surface radiation under settled conditions. It is not
 * a clinical thermometer and it cannot identify which animal filled the ROI.
 * Every user-facing label here therefore says "surface" or "screening", and a
 * missing frame always names the concrete reason instead of silently blinking.
 */

export type ThermalFrameErrorCode =
  | 'no-base'
  | 'fetch-failed'
  | `frame-too-small:${number}`
  | string;

/** Plain-language explanation for a rejected or unavailable thermal frame. */
export function explainThermalFrameError(code: ThermalFrameErrorCode | null): string {
  if (!code) return 'no frame error reported';
  if (code === 'no-base') return 'no Pi console configured — reconnect to PigPulse';
  if (code === 'fetch-failed') return 'Pi console unreachable — check Pi power and PigPulse Wi-Fi';
  const small = /^frame-too-small:(\d+)$/.exec(code);
  if (small) return `expected 768 pixels, got ${small[1]}`;
  return `frame rejected (${code})`;
}

/**
 * Convert a raw device verdict into a screening-only label.
 * Never present FEVER/ALERT as a diagnosis from this sensor alone.
 */
export function screeningLabel(raw: string | undefined): string {
  const v = (raw ?? '').trim().toUpperCase();
  if (/FEVER|ALERT|CRITICAL|HIGH/.test(v)) return 'ELEVATED SURFACE — SCREENING ONLY';
  if (/WATCH|ELEVATED|WARN|OUT_OF_BAND/.test(v)) return 'WATCH — SURFACE ESTIMATE';
  if (/NORMAL|OK|HEALTHY/.test(v)) return 'NORMAL SURFACE RANGE';
  return 'NO VERDICT — SURFACE ESTIMATE';
}

export interface ThermalSubtitleInput {
  live: boolean;
  frame: unknown;
  pbStats: unknown;
  pbFresh: boolean;
  now: number;
  frameError: string | null;
  /** Pre-formatted age string from the caller, which owns agoLabel(). */
  ago?: string;
}

/** Shared header subtitle; `ago` is supplied by the UI so this stays pure. */
export function thermalSubtitle(input: ThermalSubtitleInput): string {
  if (input.live && input.frame) return 'Live barn thermal — pi-thermal-01';
  if (input.frameError) return `No live frames — ${explainThermalFrameError(input.frameError)}`;
  if (input.pbFresh && input.pbStats) return 'Live readings — camera frames unavailable';
  if (input.pbStats) return `No live frames — last reading ${input.ago ?? 'at an unknown time'}`;
  return 'No live data — barn offline';
}
