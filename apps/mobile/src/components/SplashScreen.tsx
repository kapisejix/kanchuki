import { Image, View, StyleSheet, StatusBar } from 'react-native'

/**
 * Custom splash screen showing both Kanchuki logos:
 * 1. Center K icon (splash-icon.png) with 5-7% padding
 * 2. Full Kanchuki wordmark underneath
 */
export function SplashScreen() {
  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#d2e2ec" />
      {/* Center K icon with 5-7% padding */}
      <View style={styles.logoContainer}>
        <Image
          source={require('../../assets/splash-icon.png')}
          style={styles.centerLogo}
          resizeMode="contain"
        />
      </View>

      {/* Full Kanchuki wordmark underneath */}
      <View style={styles.wordmarkContainer}>
        <Image
          source={require('../../assets/kanchuki-full-logo.png')}
          style={styles.wordmark}
          resizeMode="contain"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#d2e2ec',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    // 5-7% padding around the logo (relative to screen width)
    padding: '6%',
  },
  centerLogo: {
    width: 120,
    height: 120,
  },
  wordmarkContainer: {
    alignItems: 'center',
    marginTop: 24,
  },
  wordmark: {
    width: 240,
    height: 48,
  },
})
