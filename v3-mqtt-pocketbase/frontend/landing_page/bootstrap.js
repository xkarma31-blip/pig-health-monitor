/**
 * Wires DOM to PIGPULSE_CONFIG — keeps index.html free of hardcoded production URLs.
 */
(function () {
  const cfg = () => window.PIGPULSE_CONFIG || {};

  function launchAppOrWeb() {
    const c = cfg();
    const webUrl = getAppUrl(c);
    if (typeof playClick === 'function') playClick();
    window.location.href = webUrl;
  }

  function getAppUrl(c) {
    const isLocal = /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
    const base = isLocal ? (c.localAppUrl || c.appUrl) : c.appUrl;
    return (base || '/').replace(/\/?$/, '/tabs');
  }

  function applyReducedMotion() {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.documentElement.classList.add('reduce-motion');
    // Reduced motion: auto-init audio silently bypasses the old banner overlay
    if (typeof window.startAudioEngine === 'function') window.startAudioEngine();
  }

  function wireLinks() {
    const c = cfg();
    document.querySelectorAll('[data-config-href]').forEach((el) => {
      const key = el.getAttribute('data-config-href');
      const url = key === 'appUrl' ? getAppUrl(c) : c[key];
      if (url) {
        el.setAttribute('href', url);
        if (key === 'appUrl' || key === 'repoUrl' || key === 'apkUrl') {
          el.setAttribute('rel', 'noopener noreferrer');
          if (!el.getAttribute('target')) el.setAttribute('target', '_blank');
        }
      }
    });

    // Restore APK buttons with direct EAS link
    document.querySelectorAll('[data-config-download="apkFilename"]').forEach((el) => {
      if (c.apkUrl) {
        el.style.display = 'flex';
        el.setAttribute('href', c.apkUrl);
      } else {
        el.style.display = 'none';
      }
    });

    const fp = c.firebase?.pathPattern || '/users/{uid}/telemetry/{deviceId}';
    const fbTip = `Google Firebase RTDB\n• Security: JWT Auth Rules\n• Path: ${fp}\n• Arch: NoSQL JSON Tree`;
    document.querySelectorAll('[data-firebase-node]').forEach((el) => {
      el.setAttribute('data-tooltip', fbTip);
    });

    const ver = document.getElementById('footer-version');
    if (ver && c.version) ver.textContent = `v${c.version}`;
    const appLink = document.getElementById('footer-app-link');
    if (appLink && (c.appUrl || c.localAppUrl)) {
      const appUrl = getAppUrl(c);
      appLink.href = appUrl;
      appLink.textContent = new URL(appUrl).host;
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
