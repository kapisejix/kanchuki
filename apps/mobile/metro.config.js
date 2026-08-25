const path = require('node:path')
const { withNativeWind } = require('nativewind/metro')
const { getSentryExpoConfig } = require('@sentry/react-native/metro')

// getSentryExpoConfig (not getDefaultConfig + withSentryConfig) wires Sentry's
// debug-id injection through Expo's own unstable_beforeAssetSerializationPlugins
// hook. withSentryConfig's generic customSerializer wrap shallow-clones the
// config, which breaks Expo's self-recursion guard in its own serializer and
// makes `expo export` crash with "Cannot read properties of undefined (reading
// 'match')" — bundleCode comes back undefined.
const config = getSentryExpoConfig(__dirname)

// shamefully-hoist=true (root .npmrc) can land react@18 (pulled in by
// apps/web/next) at the hoisted root node_modules/react. Packages that only
// declare react as a peer dep (no nested copy in the pnpm store, e.g.
// @expo-google-fonts/*) then resolve that stray copy instead of this app's
// react@19, producing a second React instance and "Invalid hook call".
// Pin bare `react` imports to this app's own copy (react-dom isn't a
// mobile dep and stays untouched, so Expo's web target still resolves it).
const reactPath = path.resolve(__dirname, 'node_modules/react')

// Workspace packages use NodeNext ".js" import extensions in TS source.
// Metro resolves literally, so try the extensionless form first.
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest
  if (moduleName === 'react' || moduleName.startsWith('react/')) {
    return resolve(context, moduleName.replace('react', reactPath), platform)
  }
  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform)
    } catch {
      // fall through to literal resolution
    }
  }
  return resolve(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: './global.css' })