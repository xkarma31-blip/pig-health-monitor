/**
 * usePiThermal — live barn-thermal data for the app.
 *
 * Two tiers, tried in order:
 *   1. CONSOLE — the Pi's console endpoints (/data, /ambient, /esp/status).
 *      Full frame (768 pixels) + stats + SHT45 ambient + mic socket state.
 *      Reachability varies by platform: browsers need the console certificate
 *      accepted + CORS; native may reject the self-signed cert. Failures are
 *      silent — the hook simply reports `live: false`.
 *   2. POCKETBASE — latest pi-thermal-01 telemetry row over the app's normal
 *      channel (works wherever PocketBase does). Stats only — no pixels.
 *
 * `live` means a console frame arrived within the freshness window; `pbFresh`
 * means a PocketBase stats row did. Callers render the labeled simulation only
 * when neither is available.
 */

import { useEffect, useRef, useState } from 'react';
import {
  fetchPiJson,
  resolvePiBase,
  type PiAmbientData,
  type PiEspStatus,
  type PiFrameData,
} from '../utils/pi-thermal';
import { subscribeTelemetry } from '../utils/pocketbase-data';
import { telemetryFresh } from '../utils/telemetry-time';

export interface PiPbStats {
  /**
   * Mean over the frame when the rig publishes it. Built from the real fields
   * and normalised by pos(), so an absent value is `undefined` — never 0.
   */
  avg?: number;
  /** Legacy alias kept for compatibility — zeroed by the thermal guard. */
  bodyTemp?: number;
  /**
   * Real pen temperature: the thermal guard strips `temperature`/`bodyTemp`
   * from thermal rows, so `center` is the only usable temperature field.
   */
  center?: number;
  hotspot?: number;
  max?: number;
  min?: number;
  ambient?: number;
  verdict?: string;
  timestamp?: unknown;
}

export interface PiThermalSnapshot {
  /** Latest console frame (with pixels) — null until one arrives. */
  frame: PiFrameData | null;
  /** Local clock ms when that frame arrived. */
  frameAt: number | null;
  ambient: PiAmbientData | null;
  esp: PiEspStatus | null;
  /** Console reachable and a frame arrived within the freshness window. */
  live: boolean;
  /** Latest stats row from PocketBase (works without the console). */
  pbStats: PiPbStats | null;
  /** That row is fresh (published within ~90 s). */
  pbFresh: boolean;
  /** State clock (ticks every second) — use for age labels, not Date.now() in render. */
  now: number;
  /** Resolved console/bridge base for this session (null until resolved). */
  base: string | null;
}

const FRAME_POLL_MS = 2000;
const SLOW_POLL_MS = 6000;
const LIVE_WINDOW_MS = 8000;

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A positive reading, or undefined. Thermal rows store 0 for an absent field
 * (the bridge zeroes `temperature`/`bodyTemp`), and a 0 rendered as "0.00°C"
 * is a fabricated reading — so 0 and negatives are treated as "no value".
 */
function pos(v: unknown): number | undefined {
  const n = num(v);
  return n !== undefined && n > 0 ? n : undefined;
}

export function usePiThermal(): PiThermalSnapshot {
  const [frame, setFrame] = useState<PiFrameData | null>(null);
  const [frameAt, setFrameAt] = useState<number | null>(null);
  const [ambient, setAmbient] = useState<PiAmbientData | null>(null);
  const [esp, setEsp] = useState<PiEspStatus | null>(null);
  const [pbStats, setPbStats] = useState<PiPbStats | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [base, setBase] = useState<string | null>(null);
  const baseRef = useRef<string | null>(null);

  // Tier 2 — PocketBase stats (same channel the rest of the app uses).
  useEffect(() => {
    const unsub = subscribeTelemetry('pi-thermal-01', (rec) => {
      if (!rec) {
        setPbStats(null);
        return;
      }
      setPbStats({
        // A stored 0 is "field absent", not a reading. Prefer the real centre
        // value and leave `avg` undefined rather than publishing a fake 0.0°.
        avg: pos(rec.temperature) ?? pos(rec.center),
        bodyTemp: pos(rec.bodyTemp),
        center: pos(rec.center),
        hotspot: num(rec.hotspot),
        max: num(rec.max),
        min: num(rec.min),
        ambient: num(rec.ambient),
        verdict:
          typeof rec.verdict === 'string'
            ? rec.verdict
            : typeof rec.status === 'string'
              ? rec.status
              : undefined,
        timestamp: rec.timestamp ?? rec.created,
      });
    });
    return unsub;
  }, []);

  // Tier 1 — console endpoints. Polls only when a base URL resolves.
  useEffect(() => {
    let alive = true;
    let frameTimer: ReturnType<typeof setInterval> | null = null;
    let slowTimer: ReturnType<typeof setInterval> | null = null;
    let frameInFlight = false;
    const pollFrame = async () => {
      const base = baseRef.current;
      if (!base || frameInFlight) return;
      frameInFlight = true;
      try {
        const data = await fetchPiJson<PiFrameData>(base, `/data?ts=${Date.now()}`);
        if (!alive) return;
        if (data && Array.isArray(data.pixels) && data.pixels.length >= 768) {
          setFrame(data);
          setFrameAt(Date.now());
        }
      } finally {
        frameInFlight = false;
      }
    };

    let slowInFlight = false;
    const pollSlow = async () => {
      const base = baseRef.current;
      if (!base || slowInFlight) return;
      slowInFlight = true;
      try {
        const [amb, espStatus] = await Promise.all([
          fetchPiJson<PiAmbientData>(base, `/ambient?ts=${Date.now()}`),
          fetchPiJson<PiEspStatus>(base, `/esp/status?ts=${Date.now()}`),
        ]);
        if (!alive) return;
        if (amb) setAmbient(amb);
        if (espStatus) setEsp(espStatus);
      } finally {
        slowInFlight = false;
      }
    };

    (async () => {
      const resolved = await resolvePiBase();
      if (!alive || !resolved) return;
      baseRef.current = resolved;
      setBase(resolved);
      void pollFrame();
      void pollSlow();
      frameTimer = setInterval(() => void pollFrame(), FRAME_POLL_MS);
      slowTimer = setInterval(() => void pollSlow(), SLOW_POLL_MS);
    })();

    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      alive = false;
      if (frameTimer) clearInterval(frameTimer);
      if (slowTimer) clearInterval(slowTimer);
      clearInterval(tick);
    };
  }, []);

  const live = frameAt !== null && now - frameAt < LIVE_WINDOW_MS;
  const pbFresh = pbStats !== null && telemetryFresh(pbStats.timestamp, now);

  return { frame, frameAt, ambient, esp, live, pbStats, pbFresh, now, base };
}
