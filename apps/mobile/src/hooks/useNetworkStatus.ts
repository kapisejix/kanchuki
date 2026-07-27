/**
 * useNetworkStatus — wraps @tanstack/react-query's onlineManager.
 *
 * Why: react-query's onlineManager subscribes to the browser/native
 * connectivity APIs already. On React Native it uses the `navigator.onLine`
 * polyfill plus Platform-specific fetch-failure detection, which is
 * sufficient for catalog offline browsing.
 *
 * No @react-native-community/netinfo dep needed — that would require a native
 * module rebuild (expo prebuild / expo run:android). This hook gives the same
 * online/offline boolean without any native modules.
 *
 * Usage:
 *   const { isOnline } = useNetworkStatus()
 *   if (!isOnline) { ... show offline UI }
 */

import { useState, useEffect } from 'react'
import { onlineManager } from '@tanstack/react-query'

export interface NetworkStatus {
  /** true when react-query considers the device online */
  isOnline: boolean
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(onlineManager.isOnline())

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online)
    })
    return () => unsubscribe()
  }, [])

  return { isOnline }
}
