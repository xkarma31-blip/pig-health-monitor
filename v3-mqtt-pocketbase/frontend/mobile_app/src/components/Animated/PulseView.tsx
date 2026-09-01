/**
 * 💫 PulseView — Breathing glow animation
 * 
 * Creates a subtle pulsing scale effect for status indicators,
 * live data badges, and the Advisor FAB.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, ViewStyle, Platform } from 'react-native';

interface PulseViewProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  duration?: number;  // full cycle duration in ms
  style?: ViewStyle;
  active?: boolean;   // only pulse when active
}

export function PulseView({ 
  children, 
  minScale = 0.97, 
  maxScale = 1.03, 
  duration = 2000, 
  style,
  active = true 
}: PulseViewProps) {
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: maxScale,
          duration: duration / 2,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(scale, {
          toValue: minScale,
          duration: duration / 2,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, duration, maxScale, minScale]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
}
