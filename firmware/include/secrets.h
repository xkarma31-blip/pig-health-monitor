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
// REMOVED 2026-09-29. Firebase was retired in favour of MQTT + PocketBase.
// These macros were committed to git, including a live project URL and a
// plaintext service-account password. The v3 firmware never referenced a
// single one of them (0 uses in src/main.cpp) — they were pure dead weight
// that only created leak risk. Do not reintroduce.
//   FIREBASE_API_KEY       (removed)
//   FIREBASE_DATABASE_URL  (removed)
//   FIREBASE_USER_EMAIL    (removed)
//   FIREBASE_USER_PASSWORD (removed)

#define FARM_USER_UID "FARMER_UID_HERE"

#endif
