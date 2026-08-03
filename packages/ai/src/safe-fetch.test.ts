import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockLookup = vi.fn()
vi.mock('node:dns/promises', () => ({ lookup: mockLookup, default: { lookup: mockLookup } }))

const { ssrfSafeFetch, readCappedBuffer } = await import('./safe-fetch.js')

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), init)
}

beforeEach(() => {
  mockLookup.mockReset()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ssrfSafeFetch', () => {
  it('blocks a private IP literal without hitting DNS', async () => {
    await expect(ssrfSafeFetch('http://127.0.0.1/x')).rejects.toThrow(/Blocked unsafe address/)
    expect(mockLookup).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks the cloud metadata address', async () => {
    await expect(ssrfSafeFetch('http://169.254.169.254/latest/meta-data')).rejects.toThrow(
      /Blocked unsafe address/,
    )
  })

  it('blocks a hostname that resolves to a private IP', async () => {
    mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }])
    await expect(ssrfSafeFetch('http://internal.example.com/x')).rejects.toThrow(
      /Blocked unsafe address/,
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('blocks non-http(s) protocols', async () => {
    await expect(ssrfSafeFetch('file:///etc/passwd')).rejects.toThrow(/unsupported protocol/)
  })

  it('allows a public host and returns the response', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ ok: true }))
    const res = await ssrfSafeFetch('http://cdn.example.com/photo.jpg')
    expect(res.status).toBe(200)
  })

  it('re-checks the host on every redirect hop and blocks an internal redirect target', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/' } }),
    )
    await expect(ssrfSafeFetch('http://cdn.example.com/photo.jpg')).rejects.toThrow(
      /Blocked unsafe address/,
    )
  })

  it('gives up after too many redirects', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'http://cdn.example.com/next' } }),
    )
    await expect(ssrfSafeFetch('http://cdn.example.com/photo.jpg')).rejects.toThrow(
      /Too many redirects/,
    )
  })

  it('rejects a declared Content-Length over the byte cap', async () => {
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, { status: 200, headers: { 'content-length': String(26 * 1024 * 1024) } }),
    )
    await expect(ssrfSafeFetch('http://cdn.example.com/huge.jpg')).rejects.toThrow(
      /Response too large/,
    )
  })
})

describe('readCappedBuffer', () => {
  it('reads a normal body fully', async () => {
    const res = jsonResponse({ hello: 'world' })
    const buf = await readCappedBuffer(res)
    expect(JSON.parse(buf.toString())).toEqual({ hello: 'world' })
  })

  it('throws once a streamed body exceeds the byte cap, even with no Content-Length', async () => {
    const bigChunk = new Uint8Array(26 * 1024 * 1024)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bigChunk)
        controller.close()
      },
    })
    const res = new Response(stream)
    await expect(readCappedBuffer(res)).rejects.toThrow(/exceeded/)
  })
})
