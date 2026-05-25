import { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut as fbSignOut } from 'firebase/auth';

let currentUser: User | null = null;
const listeners: Set<() => void> = new Set();

// Listen to real Firebase Auth
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  listeners.forEach(l => l());
});

export const setAuthUser = async (user: User | null) => {
  if (user === null) {
    await fbSignOut(auth);
  }
};

export const getAuthUser = () => currentUser;

export function useAuth() {
  const [user, setUser] = useState<User | null>(currentUser);
  
  useEffect(() => {
    const listener = () => setUser(currentUser);
    listeners.add(listener);
    setUser(currentUser); // Sync initial state
    return () => { listeners.delete(listener); };
  }, []);
  
  return user;
}
