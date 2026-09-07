/**
 * PigPulse v3 — PocketBase auth (self-hosted, NO Firebase)
 *
 * Two roles:
 *   - admin    → signs in via /api/admins/auth-with-password
 *                sees MOCK data & files (like the legacy versions), for demo/review
 *   - end-user → signs in via /api/collections/users/auth-with-password
 *                sees LIVE herd data from the MQTT→PocketBase pipeline
 *
 * Module-level listener pattern matches the old utils/auth.ts surface so all
 * existing importers (tabs screens, web dashboard, AdvisorModal) work unchanged.
 */

import { Platform } from 'react-native';
import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PB_FALLBACK_URLS, PB_URL } from './pocketbase';

export type PBAuthUser = {
  id: string;
  email: string;
  name?: string;
  displayName?: string;
  admin: boolean;
  token: string;
  raw: Record<string, unknown>;
} | null;

const STORAGE_KEY = 'pigpulse.pb.auth';

let currentUser: PBAuthUser = null;
const listeners: Set<() => void> = new Set();

function notify() {
  listeners.forEach((l) => l());
}

function persist(user: PBAuthUser) {
  currentUser = user;
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } else {
    // Native: persist across app restarts (AsyncStorage). Fire-and-forget.
    try {
      if (user) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      else AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      /* fire-and-forget: losing a cached session is never fatal */
    }
  }
  notify();
}

/** Rehydrate the session from web localStorage / native AsyncStorage. */
export async function initPBAuth(): Promise<void> {
  try {
    let raw: string | null = null;
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      raw = await AsyncStorage.getItem(STORAGE_KEY);
    }
    if (raw) {
      const u = JSON.parse(raw) as PBAuthUser;
      if (u && u.token) {
        currentUser = u;
        notify();
      }
    }
  } catch {
    /* no cached session — cold start, signed out */
  }
}

async function authRequest(endpoint: string, body: Record<string, unknown>): Promise<PBAuthUser> {
  const urls = [PB_URL, ...PB_FALLBACK_URLS];
  let lastErr = '';
  for (const base of urls) {
    try {
      const res = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`auth ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        token: string;
        record?: Record<string, unknown>;
        admin?: Record<string, unknown>;
      };
      const isAdmin = Boolean(data.admin);
      const rec = (isAdmin ? data.admin : data.record) || {};
      const user: PBAuthUser = {
        id: String(rec.id || rec.email || ''),
        email: String(rec.email || body.identity || ''),
        name: rec.name ? String(rec.name) : undefined,
        admin: isAdmin,
        token: data.token,
        raw: rec,
      };
      persist(user);
      return user;
    } catch (e: unknown) {
      lastErr = e instanceof Error ? String(e.message || e) : String(e);
      if (lastErr.includes('Failed to fetch') || lastErr.includes('Network') || lastErr.includes('Load failed')) continue;
      throw e;
    }
  }
  throw new Error(lastErr || 'PB auth failed on all URLs');
}

/** End-user sign-in (live herd data role). */
export async function loginWithEmail(email: string, password: string): Promise<PBAuthUser> {
  return authRequest('/api/collections/users/auth-with-password', {
    identity: email.trim(),
    password,
  });
}

/** Admin sign-in (mock data & files role, legacy-style demo). */
export async function loginAdmin(identity: string, password: string): Promise<PBAuthUser> {
  return authRequest('/api/admins/auth-with-password', {
    identity: identity.trim(),
    password,
  });
}

export async function logout(): Promise<void> {
  persist(null);
}

export const setAuthUser = async (user: PBAuthUser) => {
  persist(user);
};

export const getAuthUser = () => currentUser;

/** React hook — returns user (or null). Matches utils/auth.ts shape. */
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