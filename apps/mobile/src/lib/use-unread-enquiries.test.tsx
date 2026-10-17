import React, { useEffect } from 'react'
import renderer, { act } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UNREAD_POLL_MS, useUnreadEnquiries } from './use-unread-enquiries'

const api = vi.hoisted(() => ({ unreadEnquiries: vi.fn() }))
vi.mock('./api/collections', () => ({ collectionApi: api }))

// Focus = mount, blur = effect cleanup: the same contract expo-router's
// useFocusEffect gives (cleanup runs on blur and on unmount).
const focus = vi.hoisted(() => ({ blur: () => {} }))
vi.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void | (() => void)) =>
    useEffect(() => {
      const cleanup = cb()
      focus.blur = () => cleanup?.()
      return cleanup
    }, [cb]),
}))

let seen = -1
function Probe() {
  seen = useUnreadEnquiries()
  return null
}

let tree: ReturnType<typeof renderer.create>
const mount = async () => {
  await act(async () => {
    tree = renderer.create(<Probe />)
  })
}
const tick = (ms: number) =>
  act(async () => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  seen = -1
  api.unreadEnquiries.mockReset()
  api.unreadEnquiries.mockResolvedValue({ data: { count: 2 } })
})
afterEach(() => vi.useRealTimers())

describe('useUnreadEnquiries', () => {
  it('fetches on focus, then every 30 s', async () => {
    expect(UNREAD_POLL_MS).toBe(30_000)
    await mount()
    expect(api.unreadEnquiries).toHaveBeenCalledTimes(1)
    expect(seen).toBe(2)

    api.unreadEnquiries.mockResolvedValue({ data: { count: 1 } })
    await tick(UNREAD_POLL_MS)
    expect(api.unreadEnquiries).toHaveBeenCalledTimes(2)
    expect(seen).toBe(1)
    act(() => tree.unmount())
  })

  it('stops polling on unmount', async () => {
    await mount()
    act(() => tree.unmount())
    await tick(UNREAD_POLL_MS * 3)
    expect(api.unreadEnquiries).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops polling on blur', async () => {
    await mount()
    act(() => focus.blur())
    await tick(UNREAD_POLL_MS * 3)
    expect(api.unreadEnquiries).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    act(() => tree.unmount())
  })

  it('keeps the last count when a poll fails', async () => {
    await mount()
    api.unreadEnquiries.mockRejectedValue(new Error('offline'))
    await tick(UNREAD_POLL_MS)
    expect(seen).toBe(2)
    act(() => tree.unmount())
  })
})
