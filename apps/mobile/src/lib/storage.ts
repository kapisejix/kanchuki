import * as SecureStore from 'expo-secure-store'

// ponytail: in-memory cache over SecureStore — one disk read per key per launch
const cache = new Map<string, string | null>()

export async function getItem(key: string): Promise<string | null> {
  if (!cache.has(key)) {
    cache.set(key, await SecureStore.getItemAsync(key))
  }
  return cache.get(key) ?? null
}

export async function setItem(key: string, value: string): Promise<void> {
  cache.set(key, value)
  await SecureStore.setItemAsync(key, value)
}

export async function deleteItem(key: string): Promise<void> {
  cache.set(key, null)
  await SecureStore.deleteItemAsync(key)
}
