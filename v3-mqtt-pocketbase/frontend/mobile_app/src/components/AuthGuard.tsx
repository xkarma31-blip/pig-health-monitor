import React, { useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../theme';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  requiredAuth?: boolean;
  /** Require the PocketBase admin role (technician surfaces only). */
  requireAdmin?: boolean;
}

/**
 * Gate for technician-facing surfaces (the web admin island). End-user tabs
 * never render through this component. `user.admin === true` only when the
 * PocketBase admin endpoint answered the login — see utils/pocketbase-auth.ts.
 */
export function AuthGuard({ children, fallback, requiredAuth = true, requireAdmin = false }: AuthGuardProps) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { colors, spacing, typography } = useTheme();
  const [isMounted] = useState(() => Platform.OS !== 'web' || typeof document !== 'undefined');

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, padding: spacing.xl }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.md }]}>
          Checking session…
        </Text>
      </View>
    );
  }

  if (!isMounted) {
    return null;
  }

  const allowed = Boolean(user) && (!requireAdmin || Boolean(user?.admin));
  if (requiredAuth && !allowed) {
    if (fallback) {
      return <>{fallback}</>;
    }

    return (
      <View style={[styles.container, { backgroundColor: colors.bg, padding: spacing.xl }]}>
        <Text style={[typography.h1, { color: colors.textPrimary, marginBottom: spacing.md, textAlign: 'center' }]}>
          {requireAdmin ? 'Admins only' : 'Authentication required'}
        </Text>
        <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', lineHeight: 24 }]}>
          {requireAdmin
            ? 'This dashboard is for the technician account. Sign in with a PocketBase admin login to open it.'
            : 'Please sign in to access the Pig Health Monitor dashboard.'}
        </Text>
        <View style={[styles.actions, { marginTop: spacing.xl }]}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back to app"
            accessibilityHint="Returns to the PigPulse app home screen"
            onPress={() => router.replace('/tabs')}
            style={[styles.button, { backgroundColor: colors.surfaceVariant, borderColor: colors.divider, borderWidth: StyleSheet.hairlineWidth }]}
          >
            <Text style={[typography.body, { color: colors.textPrimary, fontWeight: '600' }]}>← Back to app</Text>
          </TouchableOpacity>
          {!user ? (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={requireAdmin ? 'Admin sign-in' : 'Sign in'}
              accessibilityHint="Opens the sign-in screen"
              onPress={() => router.replace('/login')}
              style={[styles.button, { backgroundColor: colors.accent }]}
            >
              <Text style={[typography.body, { color: colors.onAccent, fontWeight: '600' }]}>
                {requireAdmin ? 'Admin sign-in' : 'Sign in'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Sign out and switch account"
              accessibilityHint="Signs out of the current account and opens the sign-in screen"
              onPress={() => {
                void logout();
                router.replace('/login');
              }}
              style={[styles.button, { backgroundColor: colors.accent }]}
            >
              <Text style={[typography.body, { color: colors.onAccent, fontWeight: '600' }]}>
                Sign out & switch account
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: 12,
  },
  button: {
    minHeight: 48,
    minWidth: 240,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
