import { useEffect, useRef, useState } from 'react';
import { fetchPiFrame } from '../utils/pi-thermal';
import { piClock } from '../utils/pi-clock';

/**
 * usePiCctv — polls one CCTV snapshot frame at a time (the camera feed is an
 * MJPEG stream, which neither React Native's Image nor the serverless bridge
 * can consume directly; bounded JPEG snapshots are the cross-platform path).
 *
 * Every frame carries its Pi-clock capture time (`X-Frame-Ts`), which feeds
 * the shared `piClock`. A small bounded buffer is kept so a consumer can show
 * the frame that belongs to the shared presentation lag instead of the newest
 * one — the same moment the thermal panel and the audio are showing.
 *
 * Idle when no base is available. Evicted object URLs are revoked to avoid
 * leaks; the buffer is small enough that a displayed frame is never evicted.
 */

export interface PiCctvFrame {
  /** Renderable URL (object URL on web, data URL on native). */
  url: string;
  /** Pi-clock epoch ms when the JPEG was captured; null when unstamped. */
  ts: number | null;
  /** Client clock ms when the frame arrived. */
  at: number;
}

export interface PiCctvSnapshot {
  /** Newest frame URL, or null. */
  frameUrl: string | null;
  /** Local clock ms when the newest frame arrived. */
  at: number | null;
  /** A frame arrived within the freshness window. */
  live: boolean;
  /** State clock for age labels. */
  now: number;
  /** Recent frames, oldest first (bounded) — for clock-aligned selection. */
  frames: PiCctvFrame[];
}

const POLL_MS = 2500;
const LIVE_WINDOW_MS = 8000;
const MAX_FRAMES = 8;

function revoke(url: string) {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    /* not an object URL (native data URL) */
  }
}

export function usePiCctv(base: string | null): PiCctvSnapshot {
  const [frames, setFrames] = useState<PiCctvFrame[]>([]);
  const [at, setAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const framesRef = useRef<PiCctvFrame[]>([]);

  useEffect(() => {
    if (!base) return;
    let alive = true;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const capture = await fetchPiFrame(base);
        if (!alive) {
          if (capture) revoke(capture.url);
          return;
        }
        if (capture) {
          framesRef.current = framesRef.current.concat(capture);
          while (framesRef.current.length > MAX_FRAMES) {
            const evicted = framesRef.current.shift();
            if (evicted) revoke(evicted.url);
          }
          setFrames(framesRef.current);
          setAt(capture.at);
          if (capture.ts !== null) {
            piClock.observe(capture.ts, capture.at);
            const nowPi = piClock.now();
            if (nowPi !== null) piClock.ensureForAge(nowPi - capture.ts, 600);
          }
        }
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const poll = setInterval(() => void tick(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      alive = false;
      clearInterval(poll);
      clearInterval(clock);
      for (const f of framesRef.current) revoke(f.url);
      framesRef.current = [];
    };
  }, [base]);

  const latest = frames.length > 0 ? frames[frames.length - 1] : null;
  const live = at !== null && now - at < LIVE_WINDOW_MS;
  return { frameUrl: latest?.url ?? null, at, live, now, frames };
}
