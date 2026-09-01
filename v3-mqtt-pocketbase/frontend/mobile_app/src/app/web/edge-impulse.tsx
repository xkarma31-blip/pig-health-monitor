import React, { Suspense, lazy } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../theme';

// Lazy load the heavy Edge Impulse component
const EdgeImpulseHeavy = lazy(() => import('./edge-impulse-heavy'));

export default function EdgeImpulseWebScreen() {
  useTheme();

  return (
    <View style={styles.container}>
      <Suspense fallback={
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading Edge Impulse AI...</Text>
          <Text style={styles.subText}>Initializing machine learning models</Text>
        </View>
      }>
        <EdgeImpulseHeavy />
      </Suspense>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '500',
    marginBottom: 8,
  },
  subText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});