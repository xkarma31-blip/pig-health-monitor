/**
 * Local notifications for device alerts (lane: alert system).
 *
 * Native only: the Expo web build has no notification runtime, so every call is
 * guarded with Platform.OS. No push server, no remote token — this is a local
 * notification fired when a new alert arrives in the list the screen already
 * subscribes to.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { alertNotification, channelSpec, permissionGuidance } from './notification-policy';

const CHANNEL_SPEC = channelSpec();
const CHANNEL_ID = CHANNEL_SPEC.id;

if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // A missing/broken notification runtime must never crash the app.
  }
}

/** Ask once for notification permission. Returns true when granted. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    // A failure to ask must never break the alerts screen.
    return false;
  }
}

/** Plain-language status text for settings/UI. */
export function notificationStatus(granted: boolean): string {
  return permissionGuidance(granted);
}

export type AlertNotification = {
  id?: string;
  type?: string;
  message?: string;
  severity?: string;
};

/**
 * Fire a local notification for one new alert. No-ops on the web and when the
 * alert has no message/type to show (nothing meaningful to announce).
 */
export async function notifyAlert(alert: AlertNotification): Promise<void> {
  if (Platform.OS === 'web') return;
  const content = alertNotification(alert);
  if (!content.body) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: CHANNEL_SPEC.name,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: CHANNEL_SPEC.vibrationPattern,
        enableVibrate: CHANNEL_SPEC.enableVibrate,
        lightColor: CHANNEL_SPEC.lightColor,
      });
    }
    await Notifications.scheduleNotificationAsync({ content, trigger: null });
  } catch {
    // Notification failure must never break the alerts list.
  }
}