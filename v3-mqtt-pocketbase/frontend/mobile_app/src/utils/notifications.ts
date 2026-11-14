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

const CHANNEL_ID = 'alerts';

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
  const body = (alert.message || alert.type || '').trim();
  if (!body) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3DDC84',
      });
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: alert.severity ? `PigPulse · ${alert.severity}` : 'PigPulse alert',
        body,
        data: { alertId: alert.id ?? null, type: alert.type ?? null },
      },
      trigger: null,
    });
  } catch {
    // Notification failure must never break the alerts list.
  }
}