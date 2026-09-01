import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { useAuth } from '../hooks/useAuth';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredAuth?: boolean;
}

export function AuthGuard({ children, fallback, requiredAuth = true }: AuthGuardProps) {
  const { user, loading } = useAuth();
  const [isMounted] = useState(() => Platform.OS !== 'web' || typeof document !== 'undefined');

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1E8449" />
        <Text style={styles.text}>Loading authentication...</Text>
      </View>
    );
  }

  if (!isMounted) {
    return null;
  }

  if (requiredAuth && !user) {
    if (fallback) {
      return <>{fallback}</>;
    }
    
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🔒 Authentication Required</Text>
        <Text style={styles.text}>
          Please sign in to access the Pig Health Monitor dashboard.
        </Text>
        <Text style={styles.subtext}>
          You'll be redirected to the login screen shortly.
        </Text>
      </View>
    );
  }

  if (!requiredAuth && user) {
    // If user is authenticated but accessing public page, redirect to dashboard
    // This would typically be handled by router logic
    return <>{children}</>;
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  subtext: {
    fontSize: 14,
    color: '#808080',
    textAlign: 'center',
    marginTop: 8,
  },
});