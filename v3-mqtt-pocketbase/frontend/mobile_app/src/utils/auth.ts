/**
 * PigPulse v3 — auth facade (PocketBase, self-hosted; NO Firebase)
 *
 * Keeps the legacy module surface so web dashboard + AdvisorModal importers
 * work unchanged: useAuth() → user|null, getAuthUser, setAuthUser, logout.
 */

import { useState, useEffect } from 'react';
import {
  getAuthUser as pbGetAuthUser,
  initPBAuth,
  logout as pbLogout,
  type PBAuthUser,
} from './pocketbase-auth';

let currentUser: PBAuthUser = pbGetAuthUser();
const listeners: Set<() => void> = new Set();

initPBAuth();

// Keep this module's mirror in sync with the canonical store.
const sync = () => {
  const u = pbGetAuthUser();
  if (u !== currentUser) {
    currentUser = u;
    listeners.forEach((l) => l());
  }
};
setInterval(sync, 700);
if (typeof window !== 'undefined') window.addEventListener('storage', sync);

export const setAuthUser = async (user: PBAuthUser) => {
  const { setAuthUser: pbSet } = await import('./pocketbase-auth');
  await pbSet(user);
  sync();
};

export const getAuthUser = () => currentUser;

export function useAuth() {
  const [user, setUser] = useState<PBAuthUser>(currentUser);

  useEffect(() => {
    const listener = () => setUser(currentUser);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return user;
}

export async function logout() {
  await pbLogout();
  sync();
}