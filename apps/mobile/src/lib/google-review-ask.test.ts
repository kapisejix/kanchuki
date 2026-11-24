import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGoogleReviewAskMessage, canAskGoogleReview } from './google-review-ask';
import { buildWhatsAppInviteUrl } from './staff-invite';

const ok = { consentGiven: true, phone: '9876543210', isOwner: true, placeId: 'ChIJabc' };

describe('canAskGoogleReview', () => {
  it('true when every gate holds', () => expect(canAskGoogleReview(ok)).toBe(true));
  it('false without consent', () =>
    expect(canAskGoogleReview({ ...ok, consentGiven: false })).toBe(false));
  it('false when consent is missing', () =>
    expect(canAskGoogleReview({ ...ok, consentGiven: undefined })).toBe(false));
  it('false for staff', () => expect(canAskGoogleReview({ ...ok, isOwner: false })).toBe(false));
  it('false without a place id', () => {
    expect(canAskGoogleReview({ ...ok, placeId: null })).toBe(false);
    expect(canAskGoogleReview({ ...ok, placeId: '' })).toBe(false);
  });
  it('false for a masked phone', () =>
    expect(canAskGoogleReview({ ...ok, phone: '••••••3210' })).toBe(false));
});

describe('buildGoogleReviewAskMessage', () => {
  it('greets, names the shop, includes the link', () => {
    const m = buildGoogleReviewAskMessage({
      customerName: 'Asha',
      shopName: 'Rani Fashions',
      reviewUrl: 'https://search.google.com/local/writereview?placeid=X',
    });
    expect(m).toContain('Asha');
    expect(m).toContain('Rani Fashions');
    expect(m).toContain('https://search.google.com/local/writereview?placeid=X');
  });
  it('opens via wa.me/91<10 digits>?text=', () => {
    const url = buildWhatsAppInviteUrl(
      '9876543210',
      buildGoogleReviewAskMessage({ customerName: 'A', shopName: 'S', reviewUrl: 'u' }),
    );
    expect(url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=.+/);
  });
});

describe('customers screen', () => {
  const src = readFileSync(join(__dirname, '../../app/(tabs)/customers.tsx'), 'utf8');
  it('uses the helper, owner-only, with label and 44px target', () => {
    expect(src).toContain('canAskGoogleReview(');
    expect(src).toContain('staffRole === null');
    expect(src).toContain('Google review');
    expect(src).toContain('minWidth: 44');
    expect(src).toContain('Linking.openURL');
  });
});
