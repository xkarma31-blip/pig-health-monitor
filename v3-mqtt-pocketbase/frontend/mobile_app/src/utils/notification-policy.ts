/** Pure notification contract shared by the Expo runtime and its tests. */

export interface AlertForNotification {
  id?: string;
  type?: string;
  message?: string;
  severity?: string;
}

export interface AlertNotificationContent {
  title: string;
  body: string;
  data: { alertId: string | null; type: string | null };
}

export function alertNotification(alert: AlertForNotification): AlertNotificationContent {
  return {
    title: alert.severity ? `PigPulse · ${alert.severity}` : 'PigPulse alert',
    body: (alert.message || alert.type || '').trim(),
    data: { alertId: alert.id ?? null, type: alert.type ?? null },
  };
}

export interface AlertChannelSpec {
  id: string;
  name: string;
  /** Android IMPORTANCE_HIGH = 4. */
  importance: 4;
  vibrationPattern: number[];
  /** Expo notifications API name (Android's enableVibration). */
  enableVibrate: boolean;
  lightColor: string;
}

export function channelSpec(): AlertChannelSpec {
  return {
    id: 'alerts',
    name: 'Alerts',
    importance: 4,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lightColor: '#3DDC84',
  };
}

export function permissionGuidance(granted: boolean): string {
  return granted
    ? 'Notifications are enabled for PigPulse alerts.'
    : 'Notification permission is not allowed. Enable PigPulse notifications in Android settings.';
}
