/**
 * useNetworkStatus — wraps @tanstack/react-query's onlineManager.
 *
 * onlineManager only reports real connectivity because
 * `setupOnlineManager()` (lib/online-manager.ts, called in app/_layout.tsx)
 * feeds it expo-network state. Without that feed React Native never fires the
 * browser online/offline events it listens for, and it reports online forever.
 *
 * Usage:
 *   const { isOnline } = useNetworkStatus()
 *   if (!isOnline) { ... show offline UI }
 */

import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export interface NetworkStatus {
  /** true when react-query considers the device online */
  isOnline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(onlineManager.isOnline());

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((online) => {
      setIsOnline(online);
    });
    return () => unsubscribe();
  }, []);

  return { isOnline };
}
