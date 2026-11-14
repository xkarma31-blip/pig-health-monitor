/**
 * Permit cleartext HTTP on Android.
 *
 * WHY THIS EXISTS
 * ---------------
 * The PigPulse app talks to the box over the farm's own Wi-Fi:
 *
 *     PocketBase   http://192.168.69.1:8090
 *     Pi web app   http://192.168.69.1:8082
 *
 * From Android 9 (API 28) onward, cleartext is blocked by default and the
 * release build failed every single request with:
 *
 *     java.net.UnknownServiceException: CLEARTEXT communication to
 *     192.168.69.1 not permitted by network security policy
 *
 * The DEBUG build worked (the RN debug manifest allows cleartext), which is
 * exactly why this only showed up on the device with the release APK.
 *
 * WHY NOT A NETWORK SECURITY CONFIG
 * ---------------------------------
 * A `network_security_config` could allow cleartext only for named hosts, but
 * Android's `<domain>` entries take literal domains/IPs - there are no CIDR
 * ranges - and the farmer is allowed to point the app at whatever address
 * their box has during setup (the wizard probes and lets them type it).
 * Locking cleartext to one IP would break every farmer whose box sits at a
 * different address. The traffic never leaves the local network: the app
 * talks to the Pi over its own AP, and there is no cloud endpoint.
 */
const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withCleartextTraffic(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
    }
    return cfg;
  });
};
