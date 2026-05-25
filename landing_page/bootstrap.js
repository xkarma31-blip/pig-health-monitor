/**
 * Wires DOM to PIGPULSE_CONFIG — keeps index.html free of hardcoded production URLs.
 */
(function () {
  const cfg = () => window.PIGPULSE_CONFIG || {};

  function launchAppOrWeb() {
    const c = cfg();
    const appUrl = c.appDeepLink || 'soulexpoapp://';
    const webUrl = (c.appUrl || '').replace(/\/?$/, '/') || '/';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
    if (typeof playClick === 'function') playClick();
    if (isMobile) {
      window.location.href = appUrl;
      setTimeout(() => {
        if (document.hasFocus()) window.location.href = webUrl;
      }, 2000);
    } else {
      window.location.href = webUrl;
    }
  }

  function applyReducedMotion() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('reduce-motion');
    const banner = document.getElementById('audio-banner');
    if (banner) {
      banner.style.display = 'none';
      banner.setAttribute('aria-hidden', 'true');
    }
  }

  function wireLinks() {
    const c = cfg();
    document.querySelectorAll('[data-config-href]').forEach((el) => {
      const key = el.getAttribute('data-config-href');
      const url = c[key];
      if (url) {
        el.setAttribute('href', url);
        if (key === 'appUrl' || key === 'repoUrl') {
          el.setAttribute('rel', 'noopener noreferrer');
          if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
        }
      }
    });
    // APK no longer tracked in git — build via EAS: cd mobile_app && npx eas build --platform android --profile preview
    const apk = document.querySelector('[data-config-download="apkFilename"]');
    if (apk) apk.style.display = 'none';

    const fp = c.firebase?.pathPattern || '/users/{uid}/telemetry/{deviceId}';
    const fbTip = `Google Firebase RTDB\n• Security: JWT Auth Rules\n• Path: ${fp}\n• Arch: NoSQL JSON Tree`;
    document.querySelectorAll('[data-firebase-node]').forEach((el) => {
      el.setAttribute('data-tooltip', fbTip);
    });

    const ver = document.getElementById('footer-version');
    if (ver && c.version) ver.textContent = `v${c.version}`;
    const appLink = document.getElementById('footer-app-link');
    if (appLink && c.appUrl) {
      appLink.href = c.appUrl;
      appLink.textContent = new URL(c.appUrl).hostname;
    }
    const landLink = document.getElementById('footer-landing-link');
    if (landLink && c.landingUrl) {
      landLink.href = c.landingUrl;
      landLink.textContent = new URL(c.landingUrl).hostname;
    }
  }

  function updateMeta() {
    const c = cfg();
    if (c.landingUrl) {
      const canon = document.querySelector('link[rel="canonical"]');
      if (canon) canon.setAttribute('href', c.landingUrl);
      const ogUrl = document.querySelector('meta[property="og:url"]');
      if (ogUrl) ogUrl.setAttribute('content', c.landingUrl);
    }
    if (c.productName && c.protocolName) {
      document.title = `${c.productName} | ${c.protocolName}`;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyReducedMotion();
    wireLinks();
    updateMeta();
  });

  window.launchAppOrWeb = launchAppOrWeb;
})();
