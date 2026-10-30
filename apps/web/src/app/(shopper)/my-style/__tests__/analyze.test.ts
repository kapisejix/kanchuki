// F-045 PR-7: the client half of selfie analysis - photo prep + the three API calls.
// Every call returns a value, never throws, and turns the API's statuses into plain
// copy (no raw API sentence reaches the screen, no fake success: RC-059/060).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearProfile, pollAnalysis, prepareUpload, startAnalysis } from '../analyze'

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('prepareUpload', () => {
  function fakeCanvas(blob: Blob | null = new Blob(['jpeg'], { type: 'image/jpeg' })) {
    const drawImage = vi.fn()
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob | null) => void, type?: string, q?: number) => {
        canvas.toBlobArgs = [type, q]
        cb(blob)
      },
      toBlobArgs: [] as unknown[],
    }
    vi.spyOn(document, 'createElement').mockReturnValue(canvas as unknown as HTMLElement)
    return { canvas, drawImage }
  }

  it('downscales a large photo to 1568px on the long edge and re-encodes as JPEG', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }))
    const { canvas, drawImage } = fakeCanvas()

    const out = await prepareUpload(new File(['x'], 'a.heic', { type: 'image/heic' }))

    expect(out.type).toBe('image/jpeg')
    expect(canvas.width).toBe(1568)
    expect(canvas.height).toBe(1176)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1568, 1176)
    expect(canvas.toBlobArgs).toEqual(['image/jpeg', 0.85])
    expect(close).toHaveBeenCalled()
  })

  it('never upscales a small photo', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600, close: vi.fn() }))
    const { canvas } = fakeCanvas()
    await prepareUpload(new File(['x'], 'a.jpg'))
    expect([canvas.width, canvas.height]).toEqual([800, 600])
  })

  it('rejects with "unreadable" when the browser cannot decode the file (e.g. HEIC on Chrome)', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('decode')))
    await expect(prepareUpload(new File(['x'], 'a.heic'))).rejects.toThrow('unreadable')
  })

  it('rejects when createImageBitmap does not exist', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(prepareUpload(new File(['x'], 'a.jpg'))).rejects.toThrow('unreadable')
  })

  it('rejects non-photo types and oversize files as "unsupported" before decoding', async () => {
    const decode = vi.fn()
    vi.stubGlobal('createImageBitmap', decode)
    for (const type of ['image/svg+xml', 'image/gif', 'application/pdf', 'text/html']) {
      await expect(prepareUpload(new File(['x'], 'a', { type }))).rejects.toThrow('unsupported')
    }
    const big = new File([new Uint8Array(25 * 1024 * 1024 + 1)], 'a.jpg', { type: 'image/jpeg' })
    await expect(prepareUpload(big)).rejects.toThrow('unsupported')
    expect(decode).not.toHaveBeenCalled()
  })

  it('accepts the Android/iOS photo types (and a missing type) through to the decoder', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }))
    fakeCanvas()
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/HEIF', '']) {
      await expect(prepareUpload(new File(['x'], 'a', { type }))).resolves.toBeInstanceOf(Blob)
    }
  })

  it('rejects when the canvas yields no blob', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10, close: vi.fn() }))
    fakeCanvas(null)
    await expect(prepareUpload(new File(['x'], 'a.jpg'))).rejects.toThrow('unreadable')
  })
})

describe('startAnalysis', () => {
  const photo = new Blob(['jpeg'], { type: 'image/jpeg' })

  it('POSTs multipart to the proxy with the consent version in the query', async () => {
    fetchMock.mockResolvedValue(json({ data: { job_id: 'mystyle_a', status: 'processing' } }, 202))

    const r = await startAnalysis(photo)

    expect(r).toEqual({ kind: 'started', jobId: 'mystyle_a' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/my-style/analyze?consent_version=mystyle-1.0')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('photo')).toBeTruthy()
    // multipart boundary must come from the browser, not be set by us
    expect(init.headers).toBeUndefined()
  })

  it('401 -> unauthorized (the sheet shows the sign-in step)', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'UNAUTHORIZED', message: 'Passport session required' } }, 401))
    expect(await startAnalysis(photo)).toEqual({ kind: 'unauthorized' })
  })

  it.each([
    [402, /limit/i],
    [409, /still being read/i],
    [503, /not available/i],
    [404, /switched off|not available/i],
    [413, /too large/i],
    [422, /couldn.t use that photo/i],
    [500, /something went wrong/i],
  ])('status %i gets plain copy, never the API sentence', async (status, copy) => {
    fetchMock.mockResolvedValue(json({ error: { code: 'X', message: 'RAW API SENTENCE' } }, status))
    const r = await startAnalysis(photo)
    expect(r.kind).toBe('error')
    expect((r as { message: string }).message).toMatch(copy)
    expect((r as { message: string }).message).not.toContain('RAW API SENTENCE')
  })

  it('a 202 with no job id is an error, not a started job', async () => {
    fetchMock.mockResolvedValue(json({ data: {} }, 202))
    expect((await startAnalysis(photo)).kind).toBe('error')
  })

  it('a network failure is an error with connection copy', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const r = await startAnalysis(photo)
    expect(r).toMatchObject({ kind: 'error', message: expect.stringMatching(/connection/i) })
  })

  it('aborting from outside (sheet closed) is "aborted", not an error (RC-014)', async () => {
    const ctrl = new AbortController()
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      return new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () =>
          rej(new DOMException('The operation was aborted.', 'AbortError')),
        )
      })
    })
    const p = startAnalysis(photo, ctrl.signal)
    ctrl.abort()
    expect(await p).toEqual({ kind: 'aborted' })
  })
})

describe('pollAnalysis', () => {
  it('GETs the job through the proxy', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'processing' } }))
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'processing' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/my-style/analyze/mystyle_a')
    expect(init.method ?? 'GET').toBe('GET')
    expect(init.credentials).toBe('include')
  })

  it('ready carries the profile', async () => {
    const profile = { undertone: 'warm', depth: 'medium', frame: 'tall' }
    fetchMock.mockResolvedValue(json({ data: { status: 'ready', profile } }))
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'ready', profile })
  })

  it('a ready reply with no profile is not a success (RC-060)', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'ready' } }))
    expect((await pollAnalysis('mystyle_a')).kind).toBe('error')
  })

  it.each([
    ['no_person', /person|you in/i],
    ['face_not_clear', /face/i],
    ['multiple_people', /one person|only you|alone/i],
    ['too_dark', /light|dark/i],
    ['read_failed', /could not read|try again/i],
    ['expired', /took too long|expired|try again/i],
  ])('failed reason %s gets its own plain copy', async (reason, copy) => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason } }))
    const r = await pollAnalysis('mystyle_a')
    expect(r.kind).toBe('failed')
    expect((r as { message: string }).message).toMatch(copy)
    expect((r as { message: string }).message).not.toContain(reason)
  })

  it('an unknown failed reason falls back to generic copy', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason: 'weird' } }))
    const r = await pollAnalysis('mystyle_a')
    expect(r).toMatchObject({ kind: 'failed', message: expect.stringMatching(/try again/i) })
  })

  it('cancelled says the data was cleared', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'cancelled' } }))
    expect(await pollAnalysis('mystyle_a')).toMatchObject({
      kind: 'failed',
      message: expect.stringMatching(/cleared/i),
    })
  })

  it('401 -> unauthorized, 404 -> gone, other -> error', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'unauthorized' })
    fetchMock.mockResolvedValueOnce(json({}, 404))
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'gone' })
    fetchMock.mockResolvedValueOnce(json({}, 503))
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'error' })
  })

  it('a network failure is a transient error, not a throw', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    expect(await pollAnalysis('mystyle_a')).toEqual({ kind: 'error' })
  })

  it('an abort is "aborted" (RC-014)', async () => {
    const ctrl = new AbortController()
    ctrl.abort()
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    expect(await pollAnalysis('mystyle_a', ctrl.signal)).toEqual({ kind: 'aborted' })
  })
})

describe('clearProfile', () => {
  it('POSTs profile/clear and reports ok only on {data:{ok:true}}', async () => {
    fetchMock.mockResolvedValue(json({ data: { ok: true } }))
    expect(await clearProfile()).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/my-style/profile/clear')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
  })

  it('a 200 without ok:true is not success', async () => {
    fetchMock.mockResolvedValue(json({ data: {} }))
    expect(await clearProfile()).toBe('error')
  })

  it('401 -> unauthorized; failure -> error; network throw -> error', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
    expect(await clearProfile()).toBe('unauthorized')
    fetchMock.mockResolvedValueOnce(json({}, 500))
    expect(await clearProfile()).toBe('error')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    expect(await clearProfile()).toBe('error')
  })
})

describe('garment mode (find similar)', () => {
  const garment = { category: 'Kurti', color_family: 'yellow', embellishments: ['Zari Work'] }

  it('startAnalysis adds mode=garment to the query; selfie stays unchanged', async () => {
    fetchMock.mockResolvedValue(json({ data: { job_id: 'j1' } }, 202))
    await startAnalysis(new Blob(['x']), undefined, 'garment')
    expect(fetchMock.mock.calls[0]![0]).toMatch(/consent_version=mystyle-1\.0&mode=garment$/)
    await startAnalysis(new Blob(['x']))
    expect(fetchMock.mock.calls[1]![0]).not.toMatch(/mode=/)
  })

  it('a ready garment poll returns the validated descriptor', async () => {
    fetchMock.mockResolvedValue(json({ data: { status: 'ready', garment } }))
    expect(await pollAnalysis('j1', undefined, 'garment')).toEqual({ kind: 'ready', garment })
  })

  it('a ready garment poll without a valid descriptor is an error, not a success (RC-060)', async () => {
    for (const bad of [undefined, { category: 'Spaceship', color_family: 'x' }, 'Kurti']) {
      fetchMock.mockResolvedValueOnce(json({ data: { status: 'ready', garment: bad } }))
      expect(await pollAnalysis('j1', undefined, 'garment')).toEqual({ kind: 'error' })
    }
  })

  it('a ready poll that carries only a profile is an error in garment mode', async () => {
    fetchMock.mockResolvedValue(
      json({ data: { status: 'ready', profile: { undertone: 'warm', depth: 'fair', frame: 'tall' } } }),
    )
    expect(await pollAnalysis('j1', undefined, 'garment')).toEqual({ kind: 'error' })
  })

  it.each([
    ['no_garment', /clothing item/],
    ['blurry', /blurry/],
    ['multiple_garments', /several pieces/],
  ])('maps the %s reason to plain copy', async (reason, re) => {
    fetchMock.mockResolvedValue(json({ data: { status: 'failed', reason } }))
    const r = await pollAnalysis('j1', undefined, 'garment')
    expect(r.kind).toBe('failed')
    expect((r as { message: string }).message).toMatch(re)
  })
})
