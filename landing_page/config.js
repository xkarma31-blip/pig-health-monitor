/**
 * HUSH HOG / Pig Health Monitor — landing page config (single source of truth)
 * Update URLs here; index.html loads this before other scripts.
 */
window.PIGPULSE_CONFIG = {
  version: '2.1.0',
  productName: 'HUSH HOG',
  protocolName: 'Sovereign Aqua Protocol',
  researchTitle: 'Multimodal TinyML Acoustic Safeguard for Open-Air Swine Farming',

  /** Canonical production app (Expo web) */
  appUrl: 'https://mobileapp-lyart.vercel.app',

  /**
   * Marketing / portfolio host (this HTML landing).
   * Set after `vercel --prod` from landing_page/ — e.g. pig-health-research-portfolio.vercel.app
   */
  landingUrl: 'https://pig-health-research-portfolio.vercel.app',

  /** Legacy alias — redirects mentally to appUrl; do not use for new links */
  legacyAppUrl: 'https://pig-health-monitor.vercel.app',

  repoUrl: 'https://codeberg.org/Solrahk/pig-health-monitor',
  docsPath: '/docs/PLAN_INDEX.md',

  /** Deep link scheme for native Expo build */
  appDeepLink: 'soulexpoapp://',

  apkFilename: './app-release.apk',

  firebase: {
    backend: 'Firebase Realtime Database',
    pathPattern: '/users/{uid}/telemetry/{deviceId}',
  },
};
