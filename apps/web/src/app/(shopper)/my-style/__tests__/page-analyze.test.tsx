// F-045 PR-7: the selfie entry on /my-style - start card, palette card, retake, clear.
// The sheet itself is covered in AnalyzeSheet.test.tsx; here it is a stub so this file
// only proves the page wiring (what opens it, what happens when it reports done).
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyStylePage from '../page'
import { clearProfile } from '../analyze'

const GARMENT = {
  category: 'Kurti',
  color_family: 'yellow',
  pattern: 'Printed',
  embellishments: ['Zari Work'],
}
vi.mock('../AnalyzeSheet', () => ({
  AnalyzeSheet: ({
    onClose,
    onDone,
    mode,
  }: {
    onClose: () => void
    onDone: (g?: unknown) => void
    mode?: string
  }) => (
    <div role="dialog" aria-label={mode === 'garment' ? 'Find similar' : 'Read my photo'}>
      <button onClick={() => onDone()}>stub-done</button>
      <button onClick={() => onDone(GARMENT)}>stub-done-garment</button>
      <button onClick={onClose}>stub-close</button>
    </div>
  ),
}))
vi.mock('../analyze', () => ({ clearProfile: vi.fn() }))
const clear = vi.mocked(clearProfile)

const fetchMock = vi.fn()
const profile = {
  undertone: 'warm',
  depth: 'medium',
  frame: 'tall',
  palette: { good: ['maroon'], avoid: ['yellow'] },
}

function feed(style_profile: unknown = null, similar: unknown = null) {
  return new Response(
    JSON.stringify({
      data: [],
      meta: {
        total: 0,
        page: 1,
        limit: 12,
        sort: 'best',
        location_scope: 'city',
        rationale_source: 'none',
        truncated: false,
        style_profile,
        similar,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  window.scrollTo = vi.fn()
})

afterEach(() => {
  fetchMock.mockReset()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('selfie entry', () => {
  it('has a "Selfie / full body" start card that opens the sheet', async () => {
    fetchMock.mockImplementation(async () => feed())
    render(<MyStylePage />)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: /selfie \/ full body/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(screen.getByText('stub-close'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('no palette card until a photo has been read', async () => {
    fetchMock.mockImplementation(async () => feed(null))
    render(<MyStylePage />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText('Your palette')).toBeNull()
  })

  it('shows the palette card from the feed meta, with colours only', async () => {
    fetchMock.mockImplementation(async () => feed(profile))
    render(<MyStylePage />)
    expect(await screen.findByText('Your palette')).toBeTruthy()
    expect(screen.getByText('maroon')).toBeTruthy()
    expect(screen.getByText('yellow')).toBeTruthy()
  })

  it('a finished read refetches the feed so the palette appears', async () => {
    fetchMock.mockImplementationOnce(async () => feed(null))
    fetchMock.mockImplementation(async () => feed(profile))
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /selfie \/ full body/i }))
    fireEvent.click(screen.getByText('stub-done'))
    expect(await screen.findByText('Your palette')).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('Retake reopens the sheet', async () => {
    fetchMock.mockImplementation(async () => feed(profile))
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /retake/i }))
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('Clear my data refetches the feed and the card goes away', async () => {
    clear.mockResolvedValue('ok')
    fetchMock.mockImplementationOnce(async () => feed(profile))
    fetchMock.mockImplementation(async () => feed(null))
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /clear my data/i }))
    await waitFor(() => expect(screen.queryByText('Your palette')).toBeNull())
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call]![1].body as string)
const lastBody = () => bodyOf(fetchMock.mock.calls.length - 1)
const LABEL = 'yellow Kurti, Printed, Zari Work'

describe('find similar entry', () => {
  it('has a "Find similar" start card that opens the sheet in garment mode', async () => {
    fetchMock.mockImplementation(async () => feed())
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }))
    expect(screen.getByRole('dialog', { name: 'Find similar' })).toBeTruthy()
  })

  it('a finished garment read refetches the feed with the descriptor and shows what is matched', async () => {
    fetchMock.mockImplementation(async () => feed())
    render(<MyStylePage />)
    expect(bodyOf(0).similar).toBeUndefined()
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }))
    fireEvent.click(screen.getByText('stub-done-garment'))
    expect(await screen.findByText(LABEL)).toBeTruthy()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(bodyOf(1).similar).toEqual(GARMENT)
  })

  it('the descriptor rides along on later sort changes', async () => {
    fetchMock.mockImplementation(async () => feed())
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }))
    fireEvent.click(screen.getByText('stub-done-garment'))
    await screen.findByText(LABEL)
    fireEvent.click(screen.getByRole('button', { name: 'Price' }))
    await waitFor(() => expect(lastBody().sort).toBe('price'))
    expect(lastBody().similar).toEqual(GARMENT)
  })

  it('Clear drops the descriptor and refetches without it', async () => {
    fetchMock.mockImplementation(async () => feed())
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }))
    fireEvent.click(screen.getByText('stub-done-garment'))
    await screen.findByText(LABEL)
    fireEvent.click(screen.getByText('stub-close'))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(screen.queryByText(/Looking for/)).toBeNull())
    expect(lastBody().similar).toBeUndefined()
  })

  it('says so when only attributes could be matched (no embeddings)', async () => {
    fetchMock.mockImplementation(async () =>
      feed(null, { source: 'attributes', embedded: 0, total: 3 }),
    )
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /find similar/i }))
    fireEvent.click(screen.getByText('stub-done-garment'))
    expect(await screen.findByText(/Closer matching is not available/)).toBeTruthy()
  })

  it('a selfie read does not set a descriptor', async () => {
    fetchMock.mockImplementation(async () => feed())
    render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /selfie \/ full body/i }))
    fireEvent.click(screen.getByText('stub-done'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(bodyOf(1).similar).toBeUndefined()
    expect(screen.queryByText(/Looking for/)).toBeNull()
  })
})

describe('kids flow keeps no photo path', () => {
  it('opening the kids form adds no file input, and the page has none while the sheet is closed', async () => {
    fetchMock.mockImplementation(async () => feed())
    const { container } = render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /for my child/i }))
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})
