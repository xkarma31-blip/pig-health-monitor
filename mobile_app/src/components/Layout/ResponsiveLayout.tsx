import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { Sidebar } from '../Navigation/Sidebar';
import { Theme } from '../../constants/Theme';

/**
 * 🧱 Responsive Layout Container
 * 
 * Injects a Sidebar on desktop and handles content constraints.
 * Desktop content fills available space without artificial max-width
 * since the sidebar already constrains the left side.
 */

export function ResponsiveLayout({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  return (
    <View style={styles.root}>
      {isDesktop && <Sidebar />}
      
      <View style={styles.main}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Theme.colors.background,
  },
  main: {
    flex: 1,
    height: '100%',
  },
});
