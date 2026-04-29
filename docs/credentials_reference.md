# 🔐 Capstone Project Credentials Reference
> Last Updated: 2026-04-27

## Firebase Console Access
- **Working Account**: `capunok4angelo@gmail.com`
- **Password**: `midotaku3576`
- **Project Display Name**: FlowTales Studio (can be renamed in Firebase Console → Project Settings → General)
- **Project ID**: `studio-1248778633-99f62` (cannot be changed)
- **Database URL**: `https://studio-1248778633-99f62-default-rtdb.firebaseio.com`
- **Web API Key**: `AIzaSyC7rpeo9XoXzg4WBoTP5-nWeTQUBroUsxc`

## Firebase Database Rules
- **Expiry**: May 31, 2026 (timestamp `1780243200000`)
- **Deployed via**: `npx firebase-tools deploy --only database`
- **Index rules**: alerts.timestamp, alerts.severity, roster.lastSeen

## Alternate Accounts (not verified for this project)
- `lightxkuro@gmail.com` — may have access but untested
- `kuroyamimori746@gmail.com` — original account, hit MFA wall

## Notes
- The project display name "FlowTales Studio" can be renamed in Firebase Console → Project Settings → General → Public-facing name. The project ID is permanent.
- Firebase Admin SDK key was NOT successfully downloaded (private key corrupted during Cloud Shell extraction). The MCP server now uses REST API instead.
- Firebase CLI is authenticated locally via `npx firebase-tools` and can deploy rules.
