# FROZEN — NOT THE PRODUCTION LANDING PAGE

Production is served from `../v3-mqtt-pocketbase/frontend/landing_page/` by
`~/bin/pigpulse-autodeploy.sh` (every 5 min) into the Vercel project
`pig-health-monitor`. See `../CANON.md` §4.

This copy is a stale subset with a Firebase-era `vercel.json` and `config.js`.
A CI job (`path-guard`) fails the build if changes are expected here — it is
kept only for reference. Do not deploy from it.
