#include <WiFi.h>
#include <HTTPClient.h>
#include "DHT.h"

// Wokwi WiFi
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

// Firebase Config
#define FIREBASE_URL "https://studio-1248778633-99f62-default-rtdb.firebaseio.com/telemetry/esp32-s3-01.json"
// To bypass auth for this Wokwi test, we will use a raw REST call.
// Note: If rules block unauthenticated, this will fail. We assume for simulation testing we can hit it or we use auth.
// Wait, earlier the user had 'PERMISSION_DENIED' on unauthenticated.
// Let's implement the Firebase REST Auth login!
#define FIREBASE_AUTH_URL "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=AIzaSyB..." // Need the web API key!

// Actually, Wokwi supports libraries. We can just use the standard REST auth if we grab the API Key,
// or we just use HTTPClient to send the data. If the user expects it to work, I need the Web API Key.

// Let's use the Python backend script's approach: authenticate with email/pass, get ID token, send data.
// But I don't have the API key in memory right now. Let me check firebase_rest_client.mjs to get the API key.
