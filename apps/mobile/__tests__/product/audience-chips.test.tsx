import { describe, it, expect, vi } from 'vitest'
import { act } from 'react-test-renderer'
import { render } from '../../src/test/__mocks__/testing-library'
import {
  AudienceChips,
  addAudience,
  audienceFromTags,
} from '../../src/components/product-detail/AudienceChips'

// "Who is it for?": five audience chips; age chips only for the kids audiences.
const mount = (audience: any, ageGroup: any, onChange = vi.fn()) => ({
  onChange,
  tree: render(<AudienceChips audience={audience} ageGroup={ageGroup} onChange={onChange} />),
})
const press = (t: any, id: string) => act(() => t.getByTestId(id).props.onPress())

// Add screen: the category text pre-selects a chip until the retailer taps one.
describe('addAudience', () => {
  it('guesses from the picked category names while untouched', () => {
    expect(addAudience(null, ['Girls Frock'])).toEqual({ audience: 'GIRLS', kids_age_group: null })
    expect(addAudience(null, ['Kurti'])).toEqual({ audience: 'WOMEN', kids_age_group: null })
  })
  it('stays undecided when the text says nothing', () => {
    expect(addAudience(null, ['Misc'])).toEqual({ audience: null, kids_age_group: null })
    expect(addAudience(null, [])).toEqual({ audience: null, kids_age_group: null })
  })
  it('a retailer pick wins over the guess, even a cleared one', () => {
    expect(addAudience({ audience: 'MEN', kids_age_group: null }, ['Kurti']).audience).toBe('MEN')
    expect(addAudience({ audience: null, kids_age_group: null }, ['Kurti']).audience).toBeNull()
  })
})

// Catalog import: detect-items already returns the AI's audience; the review row starts from it.
describe('audienceFromTags', () => {
  it('seeds the pick from the AI audience and age', () => {
    expect(audienceFromTags({ audience: 'GIRLS', kids_age_group: 'AGE_3_5' })).toEqual({
      audience: 'GIRLS',
      kids_age_group: 'AGE_3_5',
    })
  })
  it('drops an age that does not belong to a non-kids audience', () => {
    expect(audienceFromTags({ audience: 'WOMEN', kids_age_group: 'AGE_3_5' })).toEqual({
      audience: 'WOMEN',
      kids_age_group: null,
    })
  })
  it('is null (keyword guess stays) when the AI gave no audience', () => {
    expect(audienceFromTags({})).toBeNull()
    expect(audienceFromTags({ audience: null })).toBeNull()
  })
})

describe('AudienceChips', () => {
  it('shows the five audience chips with accessibility labels', () => {
    const { tree } = mount(null, null)
    for (const a of ['WOMEN', 'MEN', 'BOYS', 'GIRLS', 'KIDS_UNISEX']) {
      expect((tree.getByTestId(`audience-${a}`) as any).props.accessibilityLabel).toBeTruthy()
    }
  })

  it('hides the age row for adults and null, shows it for the kids audiences', () => {
    expect(mount(null, null).tree.queryByTestId('age-AGE_6_8')).toBeNull()
    expect(mount('WOMEN', null).tree.queryByTestId('age-AGE_6_8')).toBeNull()
    for (const a of ['BOYS', 'GIRLS', 'KIDS_UNISEX']) {
      expect(mount(a, null).tree.queryByTestId('age-AGE_6_8')).not.toBeNull()
    }
  })

  it('picking an audience emits it, keeping the age only for a kids audience', () => {
    const { tree, onChange } = mount('GIRLS', 'AGE_6_8')
    press(tree, 'audience-BOYS')
    expect(onChange).toHaveBeenLastCalledWith({ audience: 'BOYS', kids_age_group: 'AGE_6_8' })
    press(tree, 'audience-MEN')
    expect(onChange).toHaveBeenLastCalledWith({ audience: 'MEN', kids_age_group: null })
  })

  it('tapping the active audience clears audience and age', () => {
    const { tree, onChange } = mount('GIRLS', 'AGE_3_5')
    press(tree, 'audience-GIRLS')
    expect(onChange).toHaveBeenLastCalledWith({ audience: null, kids_age_group: null })
  })

  it('tapping an age chip sets it, tapping the active one clears it', () => {
    const { tree, onChange } = mount('BOYS', 'AGE_3_5')
    press(tree, 'age-AGE_9_12')
    expect(onChange).toHaveBeenLastCalledWith({ audience: 'BOYS', kids_age_group: 'AGE_9_12' })
    press(tree, 'age-AGE_3_5')
    expect(onChange).toHaveBeenLastCalledWith({ audience: 'BOYS', kids_age_group: null })
  })
})
