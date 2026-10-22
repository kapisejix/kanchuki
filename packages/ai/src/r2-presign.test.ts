// RC-080 — a presigned PUT URL must carry the exact body length in its signature, or
// one 5-minute URL accepts a PUT of any size into uploads/pending/.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@kanchuki/db', () => ({ getSecret: async () => 'test-secret' }))

const { getUploadPresignedUrl } = await import('./r2.js')

const signedHeaders = (url: string) => new URL(url).searchParams.get('X-Amz-SignedHeaders')

describe('getUploadPresignedUrl', () => {
  it('signs content-length when a length is given', async () => {
    const url = await getUploadPresignedUrl('uploads/pending/a.jpg', 'image/jpeg', 300, 1024)
    expect(signedHeaders(url)?.split(';')).toContain('content-length')
  })

  it('does not bind a length when none is given (old clients)', async () => {
    const url = await getUploadPresignedUrl('uploads/pending/a.jpg', 'image/jpeg', 300)
    expect(signedHeaders(url)?.split(';')).not.toContain('content-length')
  })
})
