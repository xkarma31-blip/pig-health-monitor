/**
 * 📳 Haptic Feedback Utility
 * 
 * Web: no-op (browsers don't have haptics)
 * Native: expo-haptics with Vibration API fallback
 */

import { Platform } from 'react-native';
import { Vibration } from 'react-native';

let hapticsAvailable = false;

export async function initHaptics(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await import('expo-haptics');
    hapticsAvailable = true;
  } catch {
    hapticsAvailable = false;
  }
}

export function haptic(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'light'): void {
  if (Platform.OS === 'web') return;

  if (hapticsAvailable) {
    import('expo-haptics').then((mod) => {
      const haptics = mod as any;
      switch (type) {
        case 'light':
          haptics.impactAsync(haptics.ImpactFeedbackStyle.Light).catch(() => {});
          break;
        case 'medium':
          haptics.impactAsync(haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          break;
        case 'heavy':
          haptics.impactAsync(haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
          break;
        case 'success':
          haptics.notificationAsync(haptics.NotificationFeedbackType.Success).catch(() => {});
          break;
        case 'warning':
          haptics.notificationAsync(haptics.NotificationFeedbackType.Warning).catch(() => {});
          break;
        case 'error':
          haptics.notificationAsync(haptics.NotificationFeedbackType.Error).catch(() => {});
          break;
      }
    }).catch(() => {
      fallbackVibration(type);
    });
  } else {
    fallbackVibration(type);
  }
}

function fallbackVibration(type: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'): void {
  switch (type) {
    case 'light':
      Vibration.vibrate(10);
      break;
    case 'medium':
      Vibration.vibrate(25);
      break;
    case 'heavy':
      Vibration.vibrate(50);
      break;
    case 'success':
      Vibration.vibrate([0, 30, 50, 30]);
      break;
    case 'warning':
      Vibration.vibrate([0, 20, 40, 20, 40, 20]);
      break;
    case 'error':
      Vibration.vibrate([0, 50, 50, 50, 50, 50]);
      break;
  }
}
