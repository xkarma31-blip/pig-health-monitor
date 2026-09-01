import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style }) => {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.card, style]}>
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.nativeContainer, style]}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.innerContent}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({ backdropFilter: 'blur(12px)' } as ViewStyle)
      : {}),
  },
  nativeContainer: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  innerContent: {
    padding: 0,
  }
});
