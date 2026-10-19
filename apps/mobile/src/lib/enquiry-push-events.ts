// F-046: tiny pub/sub so the focused Home screen can refetch its unread badge the moment a
// push lands, instead of waiting for the next 30 s poll. Its own module on purpose: the
// badge hook must not import push-notifications.ts (native notifications + the API client).
const listeners = new Set<() => void>()

export function onEnquiryPush(cb: () => void): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export function emitEnquiryPush(): void {
  for (const cb of listeners) cb()
}
