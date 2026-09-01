// Web-specific authentication fix for capstone website issues
import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User, signInWithEmailAndPassword, signOut as fbSignOut, browserLocalPersistence } from 'firebase/auth';

// Initialize Firebase with proper persistence for web
if (typeof window !== 'undefined') {
  auth.setPersistence(browserLocalPersistence).catch((error) => {
    console.warn('Failed to set persistence:', error);
  });
}

let currentUser: User | null = null;
const listeners: Set<() => void> = new Set();

// Enhanced auth state listener with error handling
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  listeners.forEach(l => l());
  
  // Log auth state changes for debugging
  console.log('Auth state changed:', user ? `User: ${user.email}` : 'No user');
}, (error) => {
  console.error('Auth state change error:', error);
});

export const setAuthUser = async (user: User | null) => {
  if (user === null) {
    await fbSignOut(auth);
  }
};

export const getAuthUser = () => currentUser;

export function useAuth() {
  const [user, setUser] = useState<User | null>(currentUser);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    const listener = () => {
      setUser(currentUser);
      setLoading(false);
    };
    
    listeners.add(listener);
    
    return () => { listeners.delete(listener); };
  }, []);

  return { user, loading };
}

// Web-specific login function
export const signIn = async (email: string, password: string) => {
  try {
    console.log('Attempting login for:', email);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log('Login successful:', userCredential.user.email);
    return userCredential.user;
  } catch (error: any) {
    console.error('Login error:', error);
    throw error;
  }
};

// Web-specific logout function
export const signOut = async () => {
  try {
    console.log('Attempting logout');
    await fbSignOut(auth);
    console.log('Logout successful');
  } catch (error: any) {
    console.error('Logout error:', error);
    throw error;
  }
};

// Check if user is authenticated (web-specific)
export const isAuthenticated = () => {
  return currentUser !== null;
};

// Get user info in web-compatible format
export const getUserInfo = () => {
  if (!currentUser) return null;
  
  return {
    uid: currentUser.uid,
    email: currentUser.email,
    displayName: currentUser.displayName,
    photoURL: currentUser.photoURL,
    emailVerified: currentUser.emailVerified,
    isAnonymous: currentUser.isAnonymous,
  };
};

// Web-specific auth persistence check
export const checkAuthPersistence = async () => {
  try {
    const user = await auth.currentUser;
    console.log('Current user from persistence:', user ? user.email : 'None');
    return user;
  } catch (error) {
    console.error('Persistence check error:', error);
    return null;
  }
};