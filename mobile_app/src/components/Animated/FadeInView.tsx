/**
 * ✨ FadeInView — Premium entrance animation
 * 
 * Wraps children with a smooth fade + slide-up entrance.
 * Uses React Native's built-in Animated API for cross-platform compatibility.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, Platform } from 'react-native';

interface FadeInViewProps {
  children: React.ReactNode;
  delay?: number;      // ms delay before animation starts
  duration?: number;   // ms duration of the animation
  slideUp?: number;    // pixels to slide up from
  style?: ViewStyle;
}

export function FadeInView({ 
  children, 
  delay = 0, 
  duration = 400, 
  slideUp = 20, 
  style 
}: FadeInViewProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(slideUp)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        delay,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
