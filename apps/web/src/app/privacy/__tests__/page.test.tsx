// Guard for the retailer-facing photo retention / training notice (§7A.6).
//
// The notice is a compliance statement, so the thing worth testing is that it
// still makes it onto the page: a section that quietly loses its "we do not
// train on your photos" sentence would leave every other check green. The page
// is also the live source of the copy recorded for legal review in
// docs/references/guides/photo-retention-notice.md.
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
