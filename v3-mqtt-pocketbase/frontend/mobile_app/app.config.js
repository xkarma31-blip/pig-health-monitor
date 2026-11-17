/**
 * PigPulse Expo config — one codebase, two web targets.
 *
 * The Pi portal serves the exported SPA under /app/ (experiments.baseUrl) and
 * needs a static "single" export. EAS Hosting serves at the domain root and
 * needs "server" output for the /api/* server routes. Export with:
 *
 *   PIGPULSE_WEB_TARGET=expo-hosting npx expo export -p web
 *
 * With no env (Pi portal / native builds) the original /app + single settings
 * are kept, so nothing about the offline rig changes.
 */
const { expo } = require('./app.json');

const expoHosting = process.env.PIGPULSE_WEB_TARGET === 'expo-hosting';

// EAS Hosting has no /app prefix; an /app baseUrl makes the HTML reference
// /app/_expo/... assets that the host returns 404 for (measured 2026-11-18).
// The key must be DELETED (not just overridden with undefined) because it is
// inherited from app.json through the spread.
const experiments = { ...expo.experiments };
if (expoHosting) delete experiments.baseUrl;
else experiments.baseUrl = '/app';

module.exports = {
  ...expo,
  web: {
    ...expo.web,
    output: expoHosting ? 'server' : 'single',
  },
  experiments,
};
