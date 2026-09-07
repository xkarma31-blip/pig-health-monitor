/**
 * PigPulse v3 — unified auth hook (PocketBase, self-hosted; NO Firebase)
 *
 * API kept identical to the deployed v2 hook:
 *   const { user, loading, logout } = useAuth();
 *
 * user.admin === true  → admin role (mock data & files, legacy demo)
 * user.admin === false → end-user role (live herd data)
 * user === null        → signed out (screens show demo figures, deployed look)
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getAuthUser,
  initPBAuth,
  logout as pbLogout,
  type PBAuthUser,
} from '../utils/pocketbase-auth';

export function useAuth() {
  const [user, setUser] = useState<PBAuthUser>(getAuthUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      await initPBAuth(); // rehydrate from localStorage (web) / AsyncStorage (native)
      if (!alive) return;
      setUser(getAuthUser());
      setLoading(false);
    })();

    // Re-read on storage/auth events (keeps multiple tabs in sync on web).
    const onStorage = () => setUser(getAuthUser());
    window.addEventListener?.('storage', onStorage);
    const interval = setInterval(() => setUser(getAuthUser()), 700);
    return () => {
      alive = false;
      window.removeEventListener?.('storage', onStorage);
      clearInterval(interval);
    };
  }, []);

  const doLogout = useCallback(async () => {
    await pbLogout();
    setUser(null);
  }, []);

  return { user, loading, logout: doLogout };
}