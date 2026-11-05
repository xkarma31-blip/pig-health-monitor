import { useEffect, useState } from 'react';
import { piClock } from '../utils/pi-clock';

/**
 * Re-render helper for clock-aligned UI: returns the current Pi-clock
 * estimate (epoch ms, lower bound), or null while the estimate is not ready.
 *
 * Ticks on an interval and also the moment the clock becomes ready or the
 * shared lag changes, so panels re-select their aligned frame without
 * waiting for the next poll.
 */
export function usePiNow(intervalMs = 500): number | null {
  const [now, setNow] = useState<number | null>(() => piClock.now());
  useEffect(() => {
    const tick = () => setNow(piClock.now());
    tick();
    const id = setInterval(tick, intervalMs);
    const off = piClock.subscribe(tick);
    return () => {
      clearInterval(id);
      off();
    };
  }, [intervalMs]);
  return now;
}
