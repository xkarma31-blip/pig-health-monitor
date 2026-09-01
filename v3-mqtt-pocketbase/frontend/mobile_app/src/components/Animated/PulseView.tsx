/**
 * 💫 PulseView — Breathing glow animation
 * 
 * Creates a subtle pulsing scale effect for status indicators,
 * live data badges, and the Advisor FAB.
 */

import React, { useEffect, useState } from 'react';
import { Animated, ViewStyle, Platform } from 'react-native';

const useNativeDriver = Platform.OS !== 'web';

interface PulseViewProps {
  children: React.ReactNode;
  minScale?: number;
  maxScale?: number;
  duration?: number;
  style?: ViewStyle;
  active?: boolean;
}

export function PulseView({
  children,
  minScale = 0.97,
  maxScale = 1.03,
  duration = 2000,
  style,
  active = true
}: PulseViewProps) {
  const [scale] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!active) {
      scale.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: maxScale, duration: duration / 2, useNativeDriver }),
        Animated.timing(scale, { toValue: minScale, duration: duration / 2, useNativeDriver }),
      ])
    );

    pulse.start();
    return () => pulse.stop();
  }, [active, duration, maxScale, minScale]);

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      {children}
    </Animated.View>
  );
}
