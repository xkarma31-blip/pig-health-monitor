import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onChildAdded, get } from 'firebase/database';
import { Expo } from 'expo-server-sdk';

const firebaseConfig = {
  apiKey: 'AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc',
  databaseURL: 'https://studio-1248778633-99f62-default-rtdb.firebaseio.com',
  projectId: 'studio-1248778633-99f62',
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const expo = new Expo();

// To prevent sending notifications for old existing alerts when the script starts
let isInitialLoad = true;

console.log('🚀 Starting Push Notification Service...');
console.log('📡 Listening for HIGH severity alerts...');

const alertsRef = ref(db, 'alerts');

// Delay disabling initial load flag to allow first batch of old alerts to pass
setTimeout(() => {
  isInitialLoad = false;
  console.log('✅ Initial load complete. Now active for new alerts.');
}, 5000);

onChildAdded(alertsRef, async (snapshot) => {
  if (isInitialLoad) return; // Skip historical alerts

  const alert = snapshot.val();
  const highPriority = ['HIGH', 'CRITICAL'].includes(alert.severity);
  
  if (alert && highPriority) {
    const isCritical = alert.severity === 'CRITICAL';
    const alertIcon = isCritical ? '🚨🚨' : '🚨';
    console.log(`\n${alertIcon} NEW ${alert.severity} SEVERITY ALERT: ${alert.type} for ${alert.pig}`);
    
    // Fetch registered push tokens
    const tokensRef = ref(db, 'pushTokens');
    const tokensSnapshot = await get(tokensRef);
    
    if (!tokensSnapshot.exists()) {
      console.log('No push tokens registered. Skipping notification.');
      return;
    }

    const tokensData = tokensSnapshot.val();
    const uniqueTokens = new Set();
    
    // Extract unique tokens
    for (const key in tokensData) {
      const t = tokensData[key].token;
      if (Expo.isExpoPushToken(t)) {
        uniqueTokens.add(t);
      } else {
        console.warn(`Invalid Expo Push Token: ${t}`);
      }
    }

    const messages = [];
    for (const pushToken of uniqueTokens) {
      messages.push({
        to: pushToken,
        sound: 'default',
        title: `${alertIcon} ${alert.severity} ALERT: ${alert.pig}`,
        body: alert.message || `${alert.type} signature detected on ${alert.pig}.`,
        priority: isCritical ? 'high' : 'normal',
        data: { alertId: snapshot.key, type: alert.type, severity: alert.severity },
      });
    }

    // The Expo push service accepts batches up to 100 messages at a time.
    const chunks = expo.chunkPushNotifications(messages);
    
    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log(`✉️ Sent push notification chunk. Tickets:`, ticketChunk);
      } catch (error) {
        console.error('❌ Error sending push notification chunk:', error);
      }
    }
  }
});
