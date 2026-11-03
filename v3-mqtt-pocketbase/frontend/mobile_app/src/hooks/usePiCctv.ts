import { useEffect, useRef, useState } from 'react';
import { fetchPiFrame } from '../utils/pi-thermal';

/**
 * usePiCctv — polls one CCTV snapshot frame at a time (the camera feed is an
 * MJPEG stream, which neither React Native's Image nor the serverless bridge
 * can consume directly; bounded JPEG snapshots are the cross-platform path).
 *
 * Idle when no base is available. Keeps only the latest URL; older object
 * URLs are revoked to avoid leaks.
 */

export interface PiCctvSnapshot {
  /** Renderable URL (object URL on web, data URL on native) or null. */
  frameUrl: string | null;
  /** Local clock ms when that frame arrived. */
  at: number | null;
  /** A frame arrived within the freshness window. */
  live: boolean;
  /** State clock for age labels. */
  now: number;
}

const POLL_MS = 2500;
const LIVE_WINDOW_MS = 8000;

function revoke(url: string) {
  try {
    URL.revokeObjectURL?.(url);
  } catch {
    /* not an object URL (native data URL) */
  }
}

export function usePiCctv(base: string | null): PiCctvSnapshot {
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!base) return;
    let alive = true;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const url = await fetchPiFrame(base);
        if (!alive) {
          if (url) revoke(url);
          return;
        }
        if (url) {
          const prev = urlRef.current;
          urlRef.current = url;
          setFrameUrl(url);
          setAt(Date.now());
          if (prev) revoke(prev);
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
    };
  }, [base]);

  const live = at !== null && now - at < LIVE_WINDOW_MS;
  return { frameUrl, at, live, now };
}
