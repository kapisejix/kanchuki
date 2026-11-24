import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

type NetState = Pick<Network.NetworkState, 'isConnected' | 'isInternetReachable'>;

// `undefined` means "not known yet" on both fields, so only an explicit `false` is offline.
export function isNetworkOnline(state: NetState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * react-query's onlineManager listens for browser `online`/`offline` events, which
 * React Native never fires, so without this it reports "online" forever: the offline
 * banner never shows and the Mark Sold replay queue (useSyncQueue) never sees a
 * reconnect. Feed it the real OS connectivity state from expo-network instead.
 * Call once at module load in the root layout.
 */
export function setupOnlineManager(): void {
  onlineManager.setEventListener((setOnline) => {
    // The listener only fires on changes, so seed the state we booted into.
    void Network.getNetworkStateAsync()
      .then((state) => setOnline(isNetworkOnline(state)))
      .catch(() => {});
    const sub = Network.addNetworkStateListener((state) => setOnline(isNetworkOnline(state)));
    return () => sub.remove();
  });
}
