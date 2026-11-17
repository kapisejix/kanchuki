import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { gbpCountLabel, gbpEmptyNote } from '../src/lib/gbp-summary'

const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')

describe('gbpCountLabel — a missing count is never shown as zero', () => {
  it('real counts, with and without an average', () => {
    expect(gbpCountLabel({ review_count: 12, avg_rating: 4.46 })).toBe('12 reviews · 4.5 average')
    expect(gbpCountLabel({ review_count: 1, avg_rating: null })).toBe('1 review')
    expect(gbpCountLabel({ review_count: 0, avg_rating: null })).toBe('0 reviews')
  })

  it('never synced: says so instead of "0 reviews"', () => {
    const waiting = gbpCountLabel({ review_count: null })
    expect(waiting).not.toMatch(/\b0\b/)
    expect(waiting).toMatch(/fetching/i)
    expect(gbpCountLabel({ review_count: undefined })).toBe(waiting)
  })

  it('never synced and the sync failed: says that', () => {
    const failed = gbpCountLabel({ review_count: null, sync_failed: true })
    expect(failed).toMatch(/could not/i)
    expect(failed).not.toMatch(/\b0\b/)
  })
})

describe('gbpEmptyNote', () => {
  it('only claims "no reviews" when Google really reported zero', () => {
    expect(gbpEmptyNote({ review_count: 0 })).toMatch(/no google reviews yet/i)
    expect(gbpEmptyNote({ review_count: null })).toBeNull()
    expect(gbpEmptyNote({ review_count: null, sync_failed: true })).toBeNull()
    expect(gbpEmptyNote({ review_count: 7 })).toMatch(/still loading/i)
  })
})

describe('AI draft of a reply + manager access (slice 3)', () => {
  it('the client calls the draft route and sends no Google id', () => {
    const src = read('src/lib/api/google-business.ts')
    expect(src).toContain('draftReply')
    expect(src).toContain('/draft-reply')
  })

  it('a draft only fills the text box: it never posts, and says whether it is AI or a template', () => {
    const src = read('src/components/GoogleReviewsTab.tsx')
    const draft = src.slice(src.indexOf('googleBusinessApi.draftReply'))
    const onSuccess = draft.slice(draft.indexOf('onSuccess'), draft.indexOf('onError'))
    expect(onSuccess).toContain('setText(')
    expect(onSuccess).not.toContain('googleBusinessApi.reply')
    expect(onSuccess).not.toContain('send.mutate')
    expect(src).toMatch(/[sS]ource\s*===\s*'template'/)
    expect(src).toMatch(/Suggest a reply/)
  })

  it('ratings screen only asks for Google status when the role may use it, and only the owner sees the setup card', () => {
    const src = read('app/growth/ratings.tsx')
    expect(src).toContain("staffCan(staffRole, 'google.reviews')")
    expect(src).toMatch(/enabled:\s*canGoogleReviews/)
    expect(src).toContain("staffCan(staffRole, 'setup')")
  })
})

describe('screens use the helper instead of a hardcoded zero', () => {
  it('no "?? 0" review count left in the Google screens', () => {
    for (const f of [
      'src/components/GoogleReviewsTab.tsx',
      'app/growth/integrations/google-business.tsx',
    ]) {
      const src = read(f)
      expect(src, f).not.toMatch(/review_count\s*\?\?\s*0/)
      expect(src, f).toContain('gbpCountLabel')
    }
    expect(read('src/components/GoogleReviewsTab.tsx')).toContain('gbpEmptyNote')
  })

  it('the tab polls while the first sync is still pending, and stops on failure', () => {
    const src = read('src/components/GoogleReviewsTab.tsx')
    expect(src).toContain('refetchInterval')
    expect(src).toMatch(/review_count\s*==\s*null/)
    expect(src).toContain('sync_failed')
  })
})
