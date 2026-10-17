import { describe, expect, it, vi } from 'vitest'
import { request } from './client'
import { collectionApi } from './collections'

vi.mock('./client', () => ({ request: vi.fn() }))

describe('collectionApi.unreadEnquiries', () => {
  // The client caches GETs for 15 s by default; a cached count would keep the
  // badge stale right after the inbox marks an enquiry SEEN.
  it('bypasses the GET cache', () => {
    void collectionApi.unreadEnquiries()
    expect(request).toHaveBeenCalledWith('/v1/collections/enquiries/unread-count', {
      getCacheTtlMs: 0,
    })
  })
})
