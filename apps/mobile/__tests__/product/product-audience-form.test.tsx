/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import renderer, { act } from 'react-test-renderer'

// Edit screen state: an AI-tagged audience shows on an untouched form, a retailer tap wins over
// a later refetch, and the save payload carries audience only when the retailer touched it.
vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).__DEV__ = true
})

const m = vi.hoisted(() => ({ update: vi.fn() }))

vi.mock('../../src/lib/api', () => ({ productApi: { update: m.update } }))
vi.mock('../../src/lib/errors', () => ({ showError: vi.fn() }))
vi.mock('expo-router', () => ({ router: { back: vi.fn() } }))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))

import { useProductDetailForm } from '../../src/hooks/useProductDetailForm'

let form: any
function Harness({ product }: { product: any }) {
  form = useProductDetailForm({ product, selectedPhotoIndex: 0, displayPhotos: [] })
  return null
}
const base = { id: 'p1', name: 'Frock', search_tags: [], sizes: [], stock: [], photos: [] }
const mount = async (product: any) => {
  let r!: ReturnType<typeof renderer.create>
  await act(async () => {
    r = renderer.create(<Harness product={product} />)
  })
  return r
}
const payload = () => m.update.mock.calls.at(-1)![1]

describe('useProductDetailForm — audience', () => {
  beforeEach(() => {
    m.update.mockReset().mockResolvedValue({})
  })

  it('shows an AI-tagged audience on an untouched form and does not send it back', async () => {
    await mount({ ...base, audience: 'GIRLS', kids_age_group: 'AGE_3_5' })
    expect(form.audience).toBe('GIRLS')
    expect(form.kidsAge).toBe('AGE_3_5')
    await act(async () => form.handleSave())
    expect(payload()).not.toHaveProperty('audience')
    expect(payload()).not.toHaveProperty('kids_age_group')
  })

  it('a retailer pick is saved and survives a later refetch', async () => {
    const r = await mount({ ...base, audience: 'GIRLS', kids_age_group: null })
    await act(async () => form.setAudiencePick({ audience: 'BOYS', kids_age_group: 'AGE_6_8' }))
    await act(async () => {
      r.update(<Harness product={{ ...base, audience: 'MEN', kids_age_group: null }} />)
    })
    expect(form.audience).toBe('BOYS')
    await act(async () => form.handleSave())
    expect(payload()).toMatchObject({ audience: 'BOYS', kids_age_group: 'AGE_6_8' })
  })

  it('clearing the chips sends null so the server clears it', async () => {
    await mount({ ...base, audience: 'WOMEN', kids_age_group: null })
    await act(async () => form.setAudiencePick({ audience: null, kids_age_group: null }))
    await act(async () => form.handleSave())
    expect(payload()).toMatchObject({ audience: null, kids_age_group: null })
  })
})
