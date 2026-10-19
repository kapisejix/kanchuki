import { render } from '@testing-library/react-native'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { MyStyleRankingNote, MY_STYLE_RANKING_POINTS } from './MyStyleRankingNote'

describe('MyStyleRankingNote', () => {
  it('shows every ranking point to the retailer', () => {
    // The suite mocks @testing-library/react-native down to toJSON() (src/test/setup.ts).
    const rendered = JSON.stringify(render(<MyStyleRankingNote />).toJSON())
    expect(rendered).toContain('How My Style ranks your store')
    for (const point of MY_STYLE_RANKING_POINTS) {
      expect(rendered).toContain(JSON.stringify(`• ${point}`).slice(1, -1))
    }
  })

  it('keeps the two fairness promises the spec makes (no pay-to-rank, 3-of-12 cap)', () => {
    const text = MY_STYLE_RANKING_POINTS.join(' ')
    expect(text).toMatch(/No plan or payment buys a better position/)
    expect(text).toMatch(/more than 3 of a shopper’s first 12/)
  })

  it('states no ranking weights, which are admin-tunable and will change', () => {
    expect(MY_STYLE_RANKING_POINTS.join(' ')).not.toMatch(/\d+\s?%|0\.\d/)
  })
})
