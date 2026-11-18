import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Google Play AI-Generated Content policy: every screen that shows AI output
// must offer an in-app report. Source pins, so a screen cannot lose the button
// silently (RC-041 shape: nothing else ties these call sites together).
const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

const SURFACES: Record<string, string> = {
  'src/components/product-detail/ProductStudioModal.tsx': 'AI Studio Shoot',
  'src/components/product-detail/ProductVideoModal.tsx': 'AI Promo Video',
  'app/product/try-on.tsx': 'Virtual try-on',
  'app/enquiry-try-on.tsx': 'Virtual try-on (in-store)',
  'app/social/create.tsx': 'AI caption',
  'app/social/schedule/[id].tsx': 'AI caption (scheduler)',
}

describe('AI content report button', () => {
  for (const [path, feature] of Object.entries(SURFACES)) {
    it(`${path} renders ReportAiContent for "${feature}"`, () => {
      const src = read(path)
      expect(src).toMatch(/import\s*\{\s*ReportAiContent\s*\}/)
      expect(src).toContain(`<ReportAiContent feature="${feature}"`)
    })
  }

  it('ReportProblem tags AI reports and attaches no image', () => {
    const src = read('src/components/ReportProblem.tsx')
    expect(src).toContain('[AI content report:')
    expect(src).toMatch(/aiContent\?:\s*\{\s*feature: string/)
  })
})
