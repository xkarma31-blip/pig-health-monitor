import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { Animated, Text, View } from 'react-native';
import { useTheme } from '../../theme';

type ToastContextValue = { showToast: (message: string) => void };
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { colors, typography } = useTheme();
  const [message, setMessage] = useState<string | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const [translateY] = useState(() => new Animated.Value(8));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(msg);
    opacity.setValue(0);
    translateY.setValue(8);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();

    timer.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 8, duration: 250, useNativeDriver: true }),
      ]).start(() => setMessage(null));
    }, 1700);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      <View style={{ flex: 1 }}>
        {children}
        {message ? (
          <Animated.View
            style={[
              { pointerEvents: 'none' },
              {
                position: 'absolute',
                bottom: 90,
                alignSelf: 'center',
                paddingVertical: 10,
                paddingHorizontal: 16,
                borderRadius: 999,
                zIndex: 50,
                backgroundColor: colors.textPrimary,
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <Text style={[typography.label, { color: colors.bg, fontSize: 12.5 }]}>{message}</Text>
          </Animated.View>
        ) : null}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a <ToastProvider>');
  return ctx;
}
