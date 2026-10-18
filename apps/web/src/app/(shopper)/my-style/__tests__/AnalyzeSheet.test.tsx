// F-045 PR-7 T17: the selfie capture sheet.
//
// What matters: the file input does not exist until consent is accepted; one tap = one
// upload (RC-015); polling is capped and stops on unmount (nothing leaks); every API
// outcome becomes plain copy; the sheet adds no history entry (RC-065/RC-006).
import { MY_STYLE_CONSENT } from '@kanchuki/shared'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnalyzeSheet } from '../AnalyzeSheet'
import { pollAnalysis, prepareUpload, startAnalysis } from '../analyze'

vi.mock('../analyze', () => ({
  prepareUpload: vi.fn(),
  startAnalysis: vi.fn(),
  pollAnalysis: vi.fn(),
}))

const prepare = vi.mocked(prepareUpload)
const start = vi.mocked(startAnalysis)
const poll = vi.mocked(pollAnalysis)
const profile = { undertone: 'warm', depth: 'medium', frame: 'tall' } as const

const onClose = vi.fn()
const onDone = vi.fn()

function setup() {
  return render(<AnalyzeSheet onClose={onClose} onDone={onDone} />)
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement | null

async function accept() {
  fireEvent.click(screen.getByRole('button', { name: MY_STYLE_CONSENT.acceptLabel }))
}

async function pick(file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })) {
  await act(async () => {
    fireEvent.change(fileInput()!, { target: { files: [file] } })
  })
}

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
  prepare.mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  start.mockResolvedValue({ kind: 'started', jobId: 'mystyle_a' })
  poll.mockResolvedValue({ kind: 'processing' })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('consent first', () => {
  it('shows the shared consent copy and renders NO file input', () => {
    const { container } = setup()
    expect(screen.getByText(MY_STYLE_CONSENT.title)).toBeTruthy()
    expect(screen.getByText(MY_STYLE_CONSENT.intro)).toBeTruthy()
    for (const p of MY_STYLE_CONSENT.points) expect(screen.getByText(p.text)).toBeTruthy()
    expect(screen.getByText(MY_STYLE_CONSENT.training)).toBeTruthy()
    expect(screen.getByRole('link', { name: /full notice/i }).getAttribute('href')).toBe(
      MY_STYLE_CONSENT.full_notice_url,
    )
    expect(container.querySelector('input')).toBeNull()
    expect(document.querySelector('input[type="file"]')).toBeNull()
  })

  it('decline closes without ever creating a file input', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: MY_STYLE_CONSENT.declineLabel }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(fileInput()).toBeNull()
  })

  it('accepting reveals the front-camera image input', async () => {
    setup()
    await accept()
    const input = fileInput()!
    expect(input.accept).toBe('image/*')
    expect(input.getAttribute('capture')).toBe('user')
  })
})

describe('happy path', () => {
  it('prepares the photo, uploads once, polls, then reports done', async () => {
    setup()
    await accept()
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    await pick(file)

    expect(prepare).toHaveBeenCalledWith(file)
    expect(start).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/reading your photo/i)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()

    poll.mockResolvedValue({ kind: 'ready', profile })
    await tick(2500)

    expect(poll).toHaveBeenCalledWith('mystyle_a', expect.anything())
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/your palette is ready/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /see my picks/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('two change events in the same tick send ONE upload (RC-015)', async () => {
    setup()
    await accept()
    const input = fileInput()!
    const f = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    await act(async () => {
      fireEvent.change(input, { target: { files: [f] } })
      fireEvent.change(input, { target: { files: [f] } })
    })
    expect(start).toHaveBeenCalledTimes(1)
  })
})

describe('start failures', () => {
  it('401 shows sign-in with a return_to back to /my-style', async () => {
    start.mockResolvedValue({ kind: 'unauthorized' })
    setup()
    await accept()
    await pick()
    const link = screen.getByRole('link', { name: /sign in/i })
    expect(link.getAttribute('href')).toBe('/login?return_to=%2Fmy-style')
    expect(poll).not.toHaveBeenCalled()
  })

  it('shows the plain message and "Try again" returns to capture', async () => {
    start.mockResolvedValue({ kind: 'error', message: "You've reached this month's limit." })
    setup()
    await accept()
    await pick()
    expect(screen.getByText("You've reached this month's limit.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(fileInput()).toBeTruthy()
  })

  it('an undecodable photo (HEIC on Chrome) says so and never uploads', async () => {
    prepare.mockRejectedValue(new Error('unreadable'))
    setup()
    await accept()
    await pick()
    expect(screen.getByText(/can.t open that photo/i)).toBeTruthy()
    expect(start).not.toHaveBeenCalled()
  })

  it('after an error a second attempt is allowed (guard resets)', async () => {
    start.mockResolvedValueOnce({ kind: 'error', message: 'nope' })
    setup()
    await accept()
    await pick()
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    await pick()
    expect(start).toHaveBeenCalledTimes(2)
  })
})

describe('polling', () => {
  it('a failed read shows its message and offers Try again', async () => {
    poll.mockResolvedValue({ kind: 'failed', message: 'That photo is too dark.' })
    setup()
    await accept()
    await pick()
    await tick(2500)
    expect(screen.getByText('That photo is too dark.')).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('a vanished job (404) is a terminal error', async () => {
    poll.mockResolvedValue({ kind: 'gone' })
    setup()
    await accept()
    await pick()
    await tick(2500)
    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy()
  })

  it('a transient poll error keeps polling', async () => {
    poll.mockResolvedValueOnce({ kind: 'error' })
    setup()
    await accept()
    await pick()
    await tick(2500)
    poll.mockResolvedValue({ kind: 'ready', profile })
    await tick(2500)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a 401 mid-poll shows sign-in', async () => {
    poll.mockResolvedValue({ kind: 'unauthorized' })
    setup()
    await accept()
    await pick()
    await tick(2500)
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy()
  })

  it('gives up after the cap and stops polling', async () => {
    setup()
    await accept()
    await pick()
    await tick(95_000)
    expect(screen.getByText(/taking longer than usual/i)).toBeTruthy()
    const calls = poll.mock.calls.length
    expect(calls).toBeGreaterThan(5)
    expect(calls).toBeLessThanOrEqual(40)
    await tick(30_000)
    expect(poll.mock.calls.length).toBe(calls)
  })

  it('unmounting stops polling and aborts the in-flight read', async () => {
    const { unmount } = setup()
    await accept()
    await pick()
    await tick(2500)
    const signal = poll.mock.calls[0]![1] as AbortSignal
    const calls = poll.mock.calls.length
    unmount()
    expect(signal.aborted).toBe(true)
    await tick(30_000)
    expect(poll.mock.calls.length).toBe(calls)
  })
})

describe('history', () => {
  it('opens and closes without touching history (one close path, RC-065/RC-006)', async () => {
    const push = vi.spyOn(window.history, 'pushState')
    const back = vi.spyOn(window.history, 'back')
    const { unmount } = setup()
    fireEvent.click(screen.getByRole('button', { name: MY_STYLE_CONSENT.declineLabel }))
    unmount()
    expect(push).not.toHaveBeenCalled()
    expect(back).not.toHaveBeenCalled()
  })
})
