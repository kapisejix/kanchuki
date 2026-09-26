// Guard for the retailer-facing photo retention / training notice (§7A.6).
//
// The notice is a compliance statement, so the thing worth testing is that it
// still makes it onto the page: a section that quietly loses its "we do not
// train on your photos" sentence would leave every other check green. The page
// is also the live source of the copy recorded for legal review in
// docs/SECURITY.md (Photo Retention Notice section).
import { TRY_ON_CONSENT } from '@kanchuki/shared'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrivacyPolicyPage from '../page'

const html = renderToStaticMarkup(<PrivacyPolicyPage />)

describe('/privacy — photo retention & training notice (§7A.6)', () => {
  it('states plainly that retailer photos are not used to train AI models', () => {
    expect(html).toContain('We do not use your photos to train AI models.')
  })

  it('renders the dedicated section', () => {
    expect(html).toContain('Product photos and AI training')
  })

  it('gives the retention window and a deletion route', () => {
    expect(html).toContain('permanently purged after 15 days')
    expect(html).toContain('mailto:privacy@kanchuki.app')
  })

  it('anchors the claim to the removal of the training-data programme', () => {
    // Without this the "not used for training" claim has no referent once the
    // F-102d programme is forgotten — the notice would read as a promise with
    // no history behind it.
    expect(html).toContain('removed on 31 August 2026')
  })

  it('does not leave a stale training-consent promise on the page', () => {
    // The consent-gated training collection was removed (migration 082);
    // nothing may re-introduce a promise to collect photos *for* training.
    expect(html.toLowerCase()).not.toContain('consent to training')
    expect(html.toLowerCase()).not.toContain('training photo consents')
  })
})

// F-039 T6 — the virtual try-on notice.
//
// The try-on case is the one place a photo of a real person IS stored, so the
// page has to draw the distinction the consent screen draws: the photo you give
// is not kept, the picture we make is. A section that lost either half would
// leave the other half misleading, which is the failure a plain "photos are
// private" sentence would not catch.
describe('/privacy — virtual try-on notice (T6)', () => {
  it('renders the try-on section', () => {
    expect(html).toContain('Virtual try-on: photos of you')
  })

  it('states both halves: the input photo is not kept, the generated one is', () => {
    expect(html).toContain('The photo you give us is never saved.')
    expect(html).toContain('The picture we make is saved')
  })

  it('points the consent screen’s "read more" link at a section that exists', () => {
    // Derived from the constant rather than hard-coded here, so renaming either
    // the id or the URL fails this test instead of silently sending every
    // consenting shopper to the top of the page.
    const anchor = TRY_ON_CONSENT.full_notice_url.split('#')[1]
    expect(anchor).toBeTruthy()
    expect(html).toContain(`id="${anchor}"`)
  })

  it('promises withdrawal, deletion, and no training', () => {
    expect(html).toContain('every try-on picture we made for you is deleted')
    expect(html).toContain('Neither photo is used to train AI models.')
  })

  it('gives in-store customers a deletion route they can actually use', () => {
    // A walk-in has no Kanchuki account, so "withdraw from My Profile" is not
    // available to them — the notice has to say what they can do instead, or
    // the promise is only real for people who signed up.
    expect(html).toContain('you can ask that store to delete it')
  })
})
