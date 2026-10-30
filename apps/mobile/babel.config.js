module.exports = function (api) {
  api.cache(true)
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-reanimated/plugin'],
    // T3.6 c: release bundles drop console.log/warn/info/debug (nothing reaches logcat);
    // console.error stays, ErrorBoundary and Sentry rely on it.
    env: {
      production: {
        plugins: [['transform-remove-console', { exclude: ['error'] }]],
      },
    },
  }
}
