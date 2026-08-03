import * as SecureStore from 'expo-secure-store';

// ponytail: in-memory cache over SecureStore — one disk read per key per launch
const cache = new Map<string, string | null>();

export async function getItem(key: string): Promise<string | null> {
  if (!cache.has(key)) {
    cache.set(key, await SecureStore.getItemAsync(key));
  }
  return cache.get(key) ?? null;
}

export async function setItem(key: string, value: string): Promise<void> {
  cache.set(key, value);
  await SecureStore.setItemAsync(key, value);
  notify(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  cache.set(key, null);
  await SecureStore.deleteItemAsync(key);
  notify(key, null);
}

// ── Change notification ───────────────────────────────────────────
// Lets subscribers react when a key is written/deleted (e.g. the theme
// provider reloads the per-user palette when retailer_id changes on
// login/logout/account switch). getItem reads never notify — a read can't
// change the stored value.
type Listener = (key: string, value: string | null) => void;

const listeners = new Map<string, Set<Listener>>();

export function subscribeStorage(key: string, listener: Listener): () => void {
  let set = listeners.get(key);
  if (!set) {
    set = new Set();
    listeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

function notify(key: string, value: string | null): void {
  const set = listeners.get(key);
  if (!set) return;
  for (const listener of set) listener(key, value);
}
