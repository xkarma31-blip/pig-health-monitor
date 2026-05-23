# RTDB Path Migration — Firmware ↔ Mobile

**Status:** OPEN (blocks enroll reaching ESP32)  
**Refs:** [Firebase security rules](https://firebase.google.com/docs/database/security/rules-conditions)

---

## Problem

| Client | Path pattern |
|--------|----------------|
| **Mobile app** | `/users/{uid}/commands/{deviceId}`, `/users/{uid}/roster`, `/users/{uid}/alerts`, `/users/{uid}/sensors` |
| **Firmware** (`main.cpp`) | `/commands/esp32-s3-01`, `/telemetry/{deviceId}`, root-level |

Enroll writes to user path; firmware listens on root → **command never arrives**.

---

## Target state (future-proof)

Single tree under authenticated farm user:

```
/users/{farmUid}/
  commands/{deviceId}     ← mobile writes, firmware reads
  telemetry/{deviceId}    ← firmware writes, mobile reads
  alerts/                 ← cloud functions / simulators
  sensors/                ← live readings
  roster/                 ← pig records
```

Rules (already partially in `firebase_config/database.rules.json`):

```json
"users": {
  "$uid": {
    ".read": "auth != null && auth.uid == $uid",
    ".write": "auth != null && auth.uid == $uid"
  }
}
```

Add `.validate` on writable nodes per [Firebase validate rules](https://firebase.google.com/docs/database/security#validation).

---

## Migration options

| Option | Effort | Risk |
|--------|--------|------|
| **A — Fix firmware** | Medium | Best long-term: firmware uses `/users/{uid}/...` after WiFi + auth token |
| **B — Dual-write app** | Low | App writes both paths during transition |
| **C — Dual-listen firmware** | Low | Firmware polls root + user path (temporary) |

**Recommended:** A + B for one release, then remove root paths.

---

## Verification checklist

- [ ] Mobile `sendCommand('ENROLL_START')` visible in Firebase console under `/users/{uid}/commands/esp32-s3-01`
- [ ] Firmware log shows command received within 5s
- [ ] Telemetry appears under `/users/{uid}/telemetry/esp32-s3-01`
- [ ] `database.rules.json` deployed: `firebase deploy --only database`

---

## Rollback

Keep git tag before firmware flash; revert `main.cpp` command paths; rules can keep legacy root read for 7 days if dual-write was used.
