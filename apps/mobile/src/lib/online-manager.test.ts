import { beforeEach, describe, expect, it, vi } from 'vitest';

// setup.ts replaces react-query with a minimal stub; this test needs the real onlineManager.
vi.mock('@tanstack/react-query', async () => await vi.importActual('@tanstack/react-query'));
import { onlineManager } from '@tanstack/react-query';

const { state, listeners, remove } = vi.hoisted(() => ({
  state: { current: { isConnected: true, isInternetReachable: true } as Record<string, unknown> },
  listeners: [] as Array<(s: Record<string, unknown>) => void>,
  remove: vi.fn(),
}));

vi.mock('expo-network', () => ({
  getNetworkStateAsync: async () => state.current,
  addNetworkStateListener: (cb: (s: Record<string, unknown>) => void) => {
    listeners.push(cb);
    return { remove };
  },
}));

import { isNetworkOnline, setupOnlineManager } from './online-manager';

// RC-115: onlineManager has no event source on React Native, so it reported "online"
// forever and useSyncQueue never saw a reconnect.
describe('isNetworkOnline', () => {
  it.each([
    [{ isConnected: true, isInternetReachable: true }, true],
    [{ isConnected: false, isInternetReachable: false }, false],
    [{ isConnected: true, isInternetReachable: false }, false], // wifi with no internet
    [{ isConnected: false }, false],
    [{ isConnected: true }, true], // reachability not known yet
    [{}, true], // nothing known yet is not "offline"
  ])('%j -> %s', (s, expected) => {
    expect(isNetworkOnline(s)).toBe(expected);
  });
});

describe('setupOnlineManager', () => {
  beforeEach(() => {
    listeners.length = 0;
    remove.mockClear();
    state.current = { isConnected: true, isInternetReachable: true };
  });

  it('seeds the boot state and follows expo-network changes', async () => {
    state.current = { isConnected: false, isInternetReachable: false };
    setupOnlineManager();
    // The seed read is async; let it settle.
    await new Promise((r) => setTimeout(r, 0));
    expect(onlineManager.isOnline()).toBe(false);

    for (const cb of listeners) cb({ isConnected: true, isInternetReachable: true });
    expect(onlineManager.isOnline()).toBe(true);

    for (const cb of listeners) cb({ isConnected: true, isInternetReachable: false });
    expect(onlineManager.isOnline()).toBe(false);
  });
});
