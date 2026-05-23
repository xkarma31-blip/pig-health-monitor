import React from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions, Platform, TouchableOpacity } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { getAuth, signOut } from 'firebase/auth';
import { Theme } from '../../constants/Theme';

/**
 * 🛰️ Navigation Sidebar (Desktop Only)
 * 
 * Compact admin-style sidebar inspired by GitHub/Notion/Linear.
 * Slim width, small text, dense layout.
 */

const NAV_ITEMS = [
  { label: 'Home', path: '/', emoji: '🏠' },
  { label: 'Events', path: '/events', emoji: '🔔' },
  { label: 'Analytics', path: '/analytics', emoji: '📈' },
  { label: 'Nodes', path: '/nodes', emoji: '📡' },
];

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [isAuth, setIsAuth] = React.useState(false);

  React.useEffect(() => {
    const unsub = getAuth().onAuthStateChanged((user) => setIsAuth(!!user));
    return () => unsub();
  }, []);

  if (width < 768) return null;

  return (
    <View style={[styles.container, isCollapsed && styles.containerCollapsed]}>
      {/* Brand Header */}
      <TouchableOpacity 
        onPress={() => setIsCollapsed(!isCollapsed)}
        style={[styles.header, isCollapsed && { alignItems: 'center', paddingHorizontal: 0 }]}
      >
        <Text style={styles.logoEmoji}>🐗</Text>
        {!isCollapsed && (
          <View style={{ marginLeft: 8 }}>
            <Text style={styles.logoText}>HUSH HOG</Text>
            <Text style={styles.logoSub}>v2.0.0-Strategic</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Nav Links */}
      <View style={styles.navLinks}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path || 
            (item.path === '/' && (pathname === '/(tabs)' || pathname === '/(tabs)/index' || pathname === '/'));
          
          return (
            <Pressable
              key={item.path}
              onPress={() => router.push(item.path)}
              style={({ hovered, pressed }: any) => [
                styles.navItem,
                (hovered || pressed) && styles.navItemHover,
                isActive && styles.navItemActive,
                isCollapsed && { justifyContent: 'center', paddingHorizontal: 0 },
                // @ts-ignore
                Platform.OS === 'web' && { cursor: 'pointer' }
              ]}
            >
              <Text style={[styles.navEmoji, isActive && { opacity: 1 }, isCollapsed && { marginRight: 0 }]}>{item.emoji}</Text>
              {!isCollapsed && (
                <Text style={[styles.navLabel, isActive && styles.navLabelActive]}>
                  {item.label}
                </Text>
              )}
              {isActive && <View style={styles.activeIndicator} />}
            </Pressable>
          );
        })}
      </View>

      {/* Footer: Auth Status */}
      <View style={styles.footer}>
        {!isCollapsed && (
          <>
            {isAuth ? (
              <TouchableOpacity 
                style={styles.authButton}
                onPress={() => { signOut(getAuth()); }}
              >
                <Text style={styles.authButtonText}>🔓 Sign Out</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity 
                style={[styles.authButton, styles.authButtonLogin]}
                onPress={() => router.push('/login')}
              >
                <Text style={[styles.authButtonText, { color: '#000' }]}>🛡️ Sign In</Text>
              </TouchableOpacity>
            )}
          </>
        )}
        {!isCollapsed && (
          <View style={styles.statusBadge}>
            <View style={[styles.statusDot, isAuth && { backgroundColor: Theme.colors.success }, !isAuth && { backgroundColor: Theme.colors.warning }]} />
            <Text style={styles.statusText}>{isAuth ? 'AUTHENTICATED' : 'GUEST MODE'}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 200,
    backgroundColor: Theme.colors.tabBar,
    borderRightWidth: 1,
    borderRightColor: Theme.colors.cardBorder,
    paddingTop: 16,
    paddingHorizontal: 10,
    // @ts-ignore — web transition
    transitionProperty: 'width',
    transitionDuration: '0.2s',
  },
  containerCollapsed: {
    width: 56,
    paddingHorizontal: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginBottom: 20,
    borderRadius: 8,
  },
  logoEmoji: {
    fontSize: 22,
  },
  logoText: {
    color: Theme.colors.primary,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  logoSub: {
    color: Theme.colors.textMuted,
    fontSize: 10,
  },
  navLinks: {
    flex: 1,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: Theme.colors.surface,
    borderWidth: 1,
    borderColor: Theme.colors.primary + '33',
  },
  navItemHover: {
    backgroundColor: Theme.colors.surface + '88',
  },
  navEmoji: {
    fontSize: 16,
    marginRight: 10,
    opacity: 0.6,
  },
  navLabel: {
    color: Theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  navLabelActive: {
    color: Theme.colors.primary,
    fontWeight: 'bold',
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    width: 3,
    height: 16,
    backgroundColor: Theme.colors.primary,
    borderRadius: 2,
  },
  footer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Theme.colors.cardBorder,
    gap: 8,
  },
  authButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Theme.colors.cardBorder,
    backgroundColor: Theme.colors.surface,
    alignItems: 'center',
  },
  authButtonLogin: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  authButtonText: {
    color: Theme.colors.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.background,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: Theme.borderRadius.pill,
    alignSelf: 'flex-start',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Theme.colors.success,
    marginRight: 6,
  },
  statusText: {
    color: Theme.colors.textMuted,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
