// Spec step 2: the shopper enters their own measurements (cm, or ft/in for height).
// Shopper-only data: the card says so, saves only on a confirmed API answer, and the
// shopper can remove it in one tap.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MeasurementsCard } from '../MeasurementsCard'
import { saveMeasurements } from '../analyze'

vi.mock('../analyze', () => ({ saveMeasurements: vi.fn() }))
const save = vi.mocked(saveMeasurements)
const onSaved = vi.fn()

const setup = (initial = null as Parameters<typeof MeasurementsCard>[0]['initial']) =>
  render(<MeasurementsCard initial={initial} onSaved={onSaved} />)
const type = (label: RegExp, v: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: v } })

afterEach(() => vi.clearAllMocks())

describe('MeasurementsCard', () => {
  it('says who sees it and that it can be deleted, and has no weight field', () => {
    const { container } = setup()
    const text = container.textContent!.toLowerCase()
    expect(text).toMatch(/only you/)
    expect(text).toMatch(/delete/)
    expect(screen.queryByLabelText(/weight/i)).toBeNull()
  })

  it('saves the four numbers in cm and tells the page', async () => {
    save.mockResolvedValue('ok')
    setup()
    type(/height/i, '163')
    type(/bust/i, '88')
    type(/waist/i, '72')
    type(/hip/i, '96')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }))
    })
    expect(save).toHaveBeenCalledWith({ height_cm: 163, bust_cm: 88, waist_cm: 72, hip_cm: 96 })
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('converts feet and inches to cm in one place', async () => {
    save.mockResolvedValue('ok')
    setup()
    fireEvent.click(screen.getByRole('button', { name: /ft.*in/i }))
    type(/feet/i, '5')
    type(/inches/i, '4')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }))
    })
    expect(save).toHaveBeenCalledWith({ height_cm: 163 })
  })

  it('refuses an out-of-range value without calling the API', async () => {
    setup()
    type(/height/i, '50')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }))
    })
    expect(save).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/height/i)
  })

  it('a failed save is reported and NOT shown as saved', async () => {
    save.mockResolvedValue('error')
    setup()
    type(/bust/i, '88')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }))
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/could not save/i)
  })

  it('two quick taps save once', async () => {
    save.mockResolvedValue('ok')
    setup()
    type(/bust/i, '88')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }))
      fireEvent.click(screen.getByRole('button', { name: /save measurements/i }))
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('remove clears all four fields on the server', async () => {
    save.mockResolvedValue('ok')
    setup({ height_cm: 163, bust_cm: 88, waist_cm: 72, hip_cm: 96, saved_at: '2026-11-12T10:00:00Z' })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /remove my measurements/i }))
    })
    expect(save).toHaveBeenCalledWith({ height_cm: null, bust_cm: null, waist_cm: null, hip_cm: null })
  })
})
