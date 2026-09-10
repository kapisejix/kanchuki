const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Strips com.google.android.gms.permission.AD_ID from the merged manifest.
 * react-native-fbsdk-next pulls it in transitively; Kanchuki does not use the
 * advertising ID (FB SDK advertiserIDCollectionEnabled / autoLogAppEventsEnabled
 * are both false in app.json). Removing it lets the Play Data safety form answer
 * "No" to advertising ID.
 *
 * NOTE: when this ships, flip Play Console -> Data safety -> advertising ID to
 * "No" in the SAME release. Never declare "No" while a build with AD_ID is live.
 */
module.exports = function withRemoveAdId(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    manifest['uses-permission'] = manifest['uses-permission'] || [];

    const AD_ID = 'com.google.android.gms.permission.AD_ID';
    const existing = manifest['uses-permission'].find(
      (p) => p.$['android:name'] === AD_ID,
    );
    if (existing) {
      existing.$['tools:node'] = 'remove';
    } else {
      manifest['uses-permission'].push({
        $: { 'android:name': AD_ID, 'tools:node': 'remove' },
      });
    }
    return cfg;
  });
};
