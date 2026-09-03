import { describe, expect, it } from 'vitest'
import { COMMENT_TEMPLATES, fillTemplate } from '../StarPicker'

describe('fillTemplate', () => {
  it('replaces every {store} and {product} token', () => {
    expect(
      fillTemplate('{product} from {store}, {store} is great', {
        store: 'Meera Sarees',
        product: 'Anarkali Suit',
      }),
    ).toBe('Anarkali Suit from Meera Sarees, Meera Sarees is great')
  })

  it('leaves a template without tokens untouched', () => {
    expect(fillTemplate('Nice product', { store: 'X', product: 'Y' })).toBe('Nice product')
  })

  it('every shipped template has both tokens and resolves cleanly', () => {
    expect(COMMENT_TEMPLATES).toHaveLength(6)
    for (const tpl of COMMENT_TEMPLATES) {
      expect(tpl).toMatch(/\{store\}/)
      expect(tpl).toMatch(/\{product\}/)
      const out = fillTemplate(tpl, { store: 'Store', product: 'Kurti' })
      expect(out).not.toMatch(/\{store\}|\{product\}/)
    }
  })
})
