/**
 * ✨ FadeInView — Premium entrance animation
 * 
 * Wraps children with a smooth fade + slide-up entrance.
 * Uses React Native's built-in Animated API for cross-platform compatibility.
 */

import React, { useEffect, useState } from 'react';
import { Animated, ViewStyle, Platform } from 'react-native';

const useNativeDriver = Platform.OS !== 'web';

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  slideUp?: number;
  style?: ViewStyle;
}

export function FadeInView({
  children,
  delay = 0,
  duration = 400,
  slideUp = 20,
  style
}: FadeInViewProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(slideUp));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration, delay, useNativeDriver }),
      Animated.timing(translateY, { toValue: 0, duration, delay, useNativeDriver }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
