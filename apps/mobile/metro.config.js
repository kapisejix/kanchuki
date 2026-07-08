const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

const config = getDefaultConfig(__dirname)

// Workspace packages use NodeNext ".js" import extensions in TS source.
// Metro resolves literally, so try the extensionless form first.
const defaultResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest
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
