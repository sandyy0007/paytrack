/**
 * Android 11+ package visibility: declare that PayTrack resolves `upi://` intents,
 * so the system can find installed UPI apps (Google Pay, PhonePe, Paytm, BHIM…).
 */
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withUpiQueries(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.queries = manifest.queries || [];
    const already = JSON.stringify(manifest.queries).includes('"android:scheme":"upi"');
    if (!already) {
      manifest.queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:scheme': 'upi', 'android:host': 'pay' } }],
          },
        ],
      });
    }
    return cfg;
  });
};
