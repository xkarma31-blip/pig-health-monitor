import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { useWebTheme } from '../../theme/WebThemeContext';

interface DesktopNavProps {
  active: string;
  onChange: (next: string) => void;
  unreadEvents: number;
}

export const DesktopBottomNav: React.FC<DesktopNavProps> = ({ active, onChange, unreadEvents }) => {
  const { theme } = useWebTheme();

  const navItems = [
    { id: 'dashboard', label: 'Home', icon: '🏠' },
    { id: 'events', label: 'Events', icon: '📋' },
    { id: 'analytics', label: 'Analytics', icon: '📈' },
    { id: 'nodes', label: 'Nodes', icon: '🐷' },
  ];

  return (
    <View style={[
      styles.navBar,
      {
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.border,
        shadowColor: theme.colors.shadow,
      }
    ]}>
      {navItems.map((item) => {
        const isActive = active === item.id;
        return (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.navItem,
              isActive && styles.navItemActive,
            ]}
            onPress={() => onChange(item.id)}
            accessibilityRole="button"
            accessibilityLabel={`Navigate to ${item.label}`}
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[
              styles.navIcon,
              isActive && styles.navIconActive,
              { color: isActive ? theme.colors.primary : theme.colors.textSecondary }
            ]}>
              {item.icon}
            </Text>
            <Text style={[
              styles.navLabel,
              isActive && styles.navLabelActive,
              { color: isActive ? theme.colors.textPrimary : theme.colors.textSecondary }
            ]}>
              {item.label}
            </Text>
            {item.id === 'events' && unreadEvents > 0 && (
              <View style={[
                styles.badge,
                { backgroundColor: theme.colors.error }
              ]}>
                <Text style={styles.badgeText}>{unreadEvents}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: Platform.OS === 'web' ? 70 : 60,
    borderTopWidth: 1,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    minHeight: 56,
    position: 'relative',
    flexDirection: 'column',
    gap: 4,
  },
  navItemActive: {
    backgroundColor: 'rgba(30, 132, 73, 0.1)',
  },
  navIcon: {
    fontSize: 24,
    marginBottom: 2,
  },
  navIconActive: {
  },
  navLabel: {
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  navLabelActive: {
    fontWeight: '600',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: '30%',
    borderRadius: 8,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
});
