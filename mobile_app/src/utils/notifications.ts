import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { push, ref } from 'firebase/database';
import { db } from './firebase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  let token;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }

    try {
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
        
      if (!projectId) {
        console.warn('Project ID not found. Ensure you have eas.projectId in app.json');
      }

      token = (
        await Notifications.getExpoPushTokenAsync({
          projectId,
        })
      ).data;
      console.log('Expo Push Token:', token);

      // Save token to Firebase so our server can send pushes to it
      if (token) {
         saveTokenToDatabase(token);
      }
    } catch (e) {
      console.log('Error getting push token', e);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

// Ensure we don't save duplicates in a naive way, but for now we just push it or set it by device ID.
// Using push is okay for a simple list, but better to use a specific node.
// We'll just push to a `/pushTokens` list
async function saveTokenToDatabase(token: string) {
  try {
    // Ideally, we'd check if it exists first, or map by a unique device ID.
    // For capstone simplicity, we'll push. A small Cloud Function or Node script will read these.
    const tokensRef = ref(db, 'pushTokens');
    // Using push to append. If it already exists, the server script can deduplicate when sending.
    // However, it's better to store by sanitized token key to prevent duplicates:
    const sanitizedToken = token.replace(/[.#$[\]]/g, '_');
    
    // Instead of push, let's use the React Native's unique device or just generic push
    await push(tokensRef, {
      token: token,
      timestamp: Date.now()
    });
    console.log("Token saved to Firebase RTDB");
  } catch(e) {
     console.error("Failed to save token to DB:", e);
  }
}
