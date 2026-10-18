// F-045 PR-7: the selfie entry on /my-style - start card, palette card, retake, clear.
// The sheet itself is covered in AnalyzeSheet.test.tsx; here it is a stub so this file
// only proves the page wiring (what opens it, what happens when it reports done).
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MyStylePage from '../page'
import { clearProfile } from '../analyze'

vi.mock('../AnalyzeSheet', () => ({
  AnalyzeSheet: ({ onClose, onDone }: { onClose: () => void; onDone: () => void }) => (
    <div role="dialog" aria-label="Read my photo">
      <button onClick={onDone}>stub-done</button>
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

function feed(style_profile: unknown = null) {
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

describe('kids flow keeps no photo path', () => {
  it('opening the kids form adds no file input, and the page has none while the sheet is closed', async () => {
    fetchMock.mockImplementation(async () => feed())
    const { container } = render(<MyStylePage />)
    fireEvent.click(await screen.findByRole('button', { name: /for my child/i }))
    expect(container.querySelector('input[type="file"]')).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })
})
