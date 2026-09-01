/**
 * 🎯 ScalePressable — Premium press feedback
 * 
 * Replaces TouchableOpacity with a scale-down animation on press.
 * Provides a more tactile, premium feel than simple opacity changes.
 * Includes optional sound + haptic feedback.
 */

import React, { useState } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp, Platform } from 'react-native';
import { playSound } from '../../utils/sounds';
import { haptic } from '../../utils/haptics';

const useNativeDriver = Platform.OS !== 'web';

interface ScalePressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleDown?: number;
  sound?: 'tap' | 'toggle' | 'navigate' | 'success' | null;
  hapticType?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | null;
  disabled?: boolean;
}

export function ScalePressable({
  children,
  onPress,
  style,
  scaleDown = 0.96,
  sound = 'tap',
  hapticType = 'light',
  disabled = false
}: ScalePressableProps) {
  const [scale] = useState(() => new Animated.Value(1));

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: scaleDown,
      useNativeDriver,
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const handlePress = () => {
    if (sound) playSound(sound);
    if (hapticType) haptic(hapticType);
    onPress?.();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
