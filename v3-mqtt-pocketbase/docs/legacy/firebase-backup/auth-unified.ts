/**
 * Unified Authentication Module
 * Works identically on both web and mobile (Expo) platforms
 * Uses Firebase Auth with platform-appropriate persistence
 */

import { Platform } from 'react-native';
import { useState, useEffect, useCallback } from 'react';
import { auth } from './firebase';
import {
  onAuthStateChanged,
  User,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  AuthError,
} from 'firebase/auth';

// Global auth state
let currentUser: User | null = null;
const authListeners: Set<() => void> = new Set();
let authInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialize Firebase Auth with platform-appropriate persistence
 * Call this once at app startup
 */
export const initializeAuth = async (): Promise<void> => {
  if (authInitialized) return;
  if (initPromise) return initPromise;
  
  initPromise = (async () => {
    try {
      // Persistence is configured at auth creation in firebase.ts:
      //   web   -> browser localStorage (getAuth)
      //   native -> AsyncStorage (initializeAuth) so sessions survive restarts
      authInitialized = true;
      console.log(`[Auth] Initialized with ${Platform.OS} persistence`);
    } catch (error) {
      console.error('[Auth] Failed to initialize:', error);
      authInitialized = true; // Don't block on persistence failure
    }
  })();
  
  return initPromise;
};

// Listen to auth state changes
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  authListeners.forEach(listener => listener());
  
  // Log auth state changes for debugging
  if (__DEV__) {
    console.log(`[Auth] State changed: ${user ? `User: ${user.email} (${user.uid})` : 'Signed out'}`);
  }
}, (error) => {
  console.error('[Auth] Auth state listener error:', error);
});

/**
 * Get current user synchronously (may be null if not initialized)
 */
export const getAuthUser = (): User | null => currentUser;

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => currentUser !== null;

/**
 * Get user info in a platform-agnostic format
 */
export const getUserInfo = () => {
  if (!currentUser) return null;
  
  return {
    uid: currentUser.uid,
    email: currentUser.email,
    displayName: currentUser.displayName,
    photoURL: currentUser.photoURL,
    emailVerified: currentUser.emailVerified,
    isAnonymous: currentUser.isAnonymous,
    metadata: {
      creationTime: currentUser.metadata.creationTime,
      lastSignInTime: currentUser.metadata.lastSignInTime,
    },
  };
};

/**
 * Subscribe to auth state changes
 * Returns an unsubscribe function
 */
export const onAuthChange = (callback: (user: User | null) => void): (() => void) => {
  const listener = () => callback(currentUser);
  authListeners.add(listener);
  
  // Immediately call with current state
  callback(currentUser);
  
  return () => authListeners.delete(listener);
};

/**
 * Sign in with email and password
 * Works identically on web and mobile
 */
export const signIn = async (email: string, password: string): Promise<User> => {
  try {
    if (__DEV__) console.log(`[Auth] Signing in: ${email}`);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    if (__DEV__) console.log(`[Auth] Sign in successful: ${userCredential.user.email}`);
    return userCredential.user;
  } catch (error) {
    const authError = error as AuthError;
    if (__DEV__) console.error('[Auth] Sign in error:', authError.code, authError.message);
    throw authError;
  }
};

/**
 * Sign out
 * Works identically on web and mobile
 */
export const signOut = async (): Promise<void> => {
  try {
    if (__DEV__) console.log('[Auth] Signing out');
    await fbSignOut(auth);
    if (__DEV__) console.log('[Auth] Sign out successful');
  } catch (error) {
    const authError = error as AuthError;
    if (__DEV__) console.error('[Auth] Sign out error:', authError.code, authError.message);
    throw authError;
  }
};

/**
 * React hook for authentication state
 * Provides user, loading state, and auth actions
 */
export function useAuth() {
  const [user, setUser] = useState<User | null>(currentUser);
  const [loading, setLoading] = useState(!authInitialized);
  
  useEffect(() => {
    // Initialize auth if not already done
    if (!authInitialized) {
      initializeAuth().then(() => setLoading(false));
    }
    
    // Subscribe to auth changes
    const unsubscribe = onAuthChange((newUser) => {
      setUser(newUser);
      setLoading(false);
    });
    
    return unsubscribe;
  }, []);
  
  // Memoized auth actions
  const login = useCallback(async (email: string, password: string) => {
    return signIn(email, password);
  }, []);
  
  const logout = useCallback(async () => {
    return signOut();
  }, []);
  
  return {
    user,
    loading,
    isAuthenticated: !!user,
    userInfo: getUserInfo(),
    login,
    logout,
  };
}

/**
 * Check auth persistence (useful for debugging)
 */
export const checkAuthPersistence = async (): Promise<User | null> => {
  try {
    // Force auth initialization if needed
    await initializeAuth();
    const user = auth.currentUser;
    if (__DEV__) console.log('[Auth] Persistence check:', user ? user.email : 'No user');
    return user;
  } catch (error) {
    console.error('[Auth] Persistence check error:', error);
    return null;
  }
};

/**
 * Get Firebase auth instance for advanced usage
 */
export { auth };

// Re-export Firebase auth types and errors
export type { User, AuthError };
export { signInWithEmailAndPassword, fbSignOut as firebaseSignOut };