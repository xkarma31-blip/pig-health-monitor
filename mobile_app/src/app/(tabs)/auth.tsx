import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../../utils/firebase';
import { Theme } from '../../constants/Theme';
import { ResponsiveLayout } from '../../components/Layout/ResponsiveLayout';

export default function AuthStatusScreen() {
  const router = useRouter();
  const [user, setUser] = useState(auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
    });
    return unsub;
  }, []);

  const handleSignOut = async () => {
    await signOut(auth);
    router.replace('/login');
  };

  return (
<ResponsiveLayout>
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.emoji}>{user ? '🛡️' : '🐗'}</Text>
        <Text style={styles.title}>
          {user ? 'Authenticated' : 'Guest Mode'}
        </Text>
        
        {user ? (
          <>
            <Text style={styles.subtitle}>Logged in as:</Text>
            <Text style={styles.email}>{user.email}</Text>
            <Text style={styles.uid}>UID: {user.uid.slice(0, 12)}...</Text>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>🔴 LIVE — Cloud Sync Active</Text>
            </View>
            <TouchableOpacity style={styles.logoutButton} onPress={handleSignOut}>
              <Text style={styles.logoutButtonText}>SIGN OUT</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>
              You are browsing as a guest.{'\n'}Sign in to access your farm data.
            </Text>
            <TouchableOpacity 
              style={styles.loginButton} 
              onPress={() => router.push('/login')}
            >
              <Text style={styles.loginButtonText}>SIGN IN</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
</ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: Theme.colors.card,
    padding: 40,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Theme.colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Theme.colors.textSecondary,
    marginBottom: 10,
    textAlign: 'center',
    lineHeight: 22,
  },
  email: {
    fontSize: 16,
    color: Theme.colors.primary,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  uid: {
    fontSize: 11,
    color: Theme.colors.textMuted,
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  statusBadge: {
    backgroundColor: Theme.colors.success + '22',
    borderWidth: 1,
    borderColor: Theme.colors.success,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 30,
  },
  statusText: {
    color: Theme.colors.success,
    fontSize: 12,
    fontWeight: 'bold',
  },
  logoutButton: {
    backgroundColor: Theme.colors.danger + '33',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Theme.colors.danger,
  },
  logoutButtonText: {
    color: Theme.colors.danger,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  loginButton: {
    backgroundColor: Theme.colors.primary,
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginTop: 10,
  },
  loginButtonText: {
    color: '#000',
    fontWeight: 'bold',
    letterSpacing: 1,
    fontSize: 16,
  },
});
