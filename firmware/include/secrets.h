#ifndef SECRETS_H
#define SECRETS_H

// ==========================================
// 🔒 SECRETS.H: THE RITUAL BINDING
// Purpose: Store Wi-Fi and Firebase credentials.
// WARNING: DO NOT COMMIT REAL CREDENTIALS TO VERSION CONTROL.
// ==========================================

// --- Wi-Fi Configuration ---
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// --- Firebase Configuration ---
// Get these from Project Settings > General > Web API Key
#define FIREBASE_API_KEY "YOUR_API_KEY"

// Get this from Realtime Database > Data (URL starts with https://)
#define FIREBASE_DATABASE_URL "https://studio-1248778633-99f62-default-rtdb.firebaseio.com"

// Optional: Firebase User Email/Password (If Auth is enabled)
#define FIREBASE_USER_EMAIL "pigmonitor@internal.dev"
#define FIREBASE_USER_PASSWORD "PigMonitor2026!"

#endif
