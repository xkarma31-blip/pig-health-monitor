/**
 * 🎯 ScalePressable — Premium press feedback
 * 
 * Replaces TouchableOpacity with a scale-down animation on press.
 * Provides a more tactile, premium feel than simple opacity changes.
 * Includes optional sound feedback.
 */

import React, { useRef } from 'react';
import { Animated, Pressable, ViewStyle, StyleProp, Platform } from 'react-native';
import { playSound } from '../../utils/sounds';

interface ScalePressableProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleDown?: number;
  sound?: 'tap' | 'toggle' | 'navigate' | 'success' | null;
  disabled?: boolean;
}

export function ScalePressable({ 
  children, 
  onPress, 
  style, 
  scaleDown = 0.96,
  sound = 'tap',
  disabled = false 
}: ScalePressableProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: scaleDown,
      useNativeDriver: Platform.OS !== 'web',
      speed: 50,
      bounciness: 0,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const handlePress = () => {
    if (sound) playSound(sound);
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
