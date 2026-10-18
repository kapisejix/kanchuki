// F-045 PR-7: the "your palette" card. Shows colour families only - never a skin-colour
// label - and "Clear my data" is only reported as done when the API says so (RC-060).
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PaletteCard } from '../PaletteCard'
import { clearProfile } from '../analyze'
import type { StyleProfile } from '../lib'

vi.mock('../analyze', () => ({ clearProfile: vi.fn() }))
const clear = vi.mocked(clearProfile)

const profile: StyleProfile = {
  undertone: 'warm',
  depth: 'medium',
  frame: 'tall',
  palette: { good: ['maroon', 'teal'], avoid: ['yellow'] },
}
const onRetake = vi.fn()
const onCleared = vi.fn()

const setup = (p = profile) =>
  render(<PaletteCard profile={p} onRetake={onRetake} onCleared={onCleared} />)

afterEach(() => vi.clearAllMocks())

describe('PaletteCard', () => {
  it('lists the colours that suit and the ones to go easy on', () => {
    setup()
    expect(screen.getByText('Your palette')).toBeTruthy()
    expect(screen.getByText('maroon')).toBeTruthy()
    expect(screen.getByText('teal')).toBeTruthy()
    expect(screen.getByText('yellow')).toBeTruthy()
  })

  it('never prints a skin-colour or body label', () => {
    const { container } = setup()
    const text = container.textContent!.toLowerCase()
    for (const word of ['warm', 'medium', 'tall', 'undertone', 'fair', 'skin', 'complexion']) {
      expect(text).not.toContain(word)
    }
  })

  it('says so honestly when no palette matches the saved look yet', () => {
    const { container } = setup({ ...profile, palette: null })
    expect(screen.getByText(/colour suggestions/i)).toBeTruthy()
    expect(container.querySelectorAll('li').length).toBe(0)
  })

  it('Retake hands control back to the page', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: /retake/i }))
    expect(onRetake).toHaveBeenCalledTimes(1)
  })

  it('Clear my data calls the API once, then tells the page', async () => {
    clear.mockResolvedValue('ok')
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear my data/i }))
      fireEvent.click(screen.getByRole('button', { name: /clear my data/i }))
    })
    expect(clear).toHaveBeenCalledTimes(1)
    expect(onCleared).toHaveBeenCalledTimes(1)
  })

  it('a failed clear is reported and NOT treated as cleared', async () => {
    clear.mockResolvedValue('error')
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear my data/i }))
    })
    expect(onCleared).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/could not clear/i)
    // and it can be retried
    clear.mockResolvedValue('ok')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear my data/i }))
    })
    expect(onCleared).toHaveBeenCalledTimes(1)
  })

  it('an expired session on clear points to sign-in instead of claiming success', async () => {
    clear.mockResolvedValue('unauthorized')
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /clear my data/i }))
    })
    expect(onCleared).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: /sign in/i })).toBeTruthy()
  })
})
