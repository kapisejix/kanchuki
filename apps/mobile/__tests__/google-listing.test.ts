import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Part A of docs/tasks/pending/google-business-profile-and-setup-checklist.md.
 * Source-level guards: the Google review card must actually open the link, and the
 * place-id field must be reachable from onboarding step 2 WITHOUT adding a step
 * (onboarding_step is persisted; TOTAL_STEPS changes renumber in-flight retailers).
 */
const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

describe('Google listing capture', () => {
  it('ratings screen opens the review link (no commented-out handler)', () => {
    const src = read('app/growth/ratings.tsx');
    expect(src).not.toMatch(/\/\*\s*Linking\.openURL/);
    expect(src).toContain('Linking.openURL(summary.google_review_url)');
  });

  it('onboarding step 2 offers the optional field and keeps 5 steps', () => {
    const src = read('app/onboarding.tsx');
    expect(src).toContain('<GooglePlaceField');
    expect(src).toMatch(/const TOTAL_STEPS = 5;/);
  });

  it('review routes use the served path /v1/retailers/reviews (RC-100: /me/reviews 404s)', () => {
    for (const f of ['src/lib/api/growth.ts', 'src/lib/api/retailer.ts']) {
      expect(read(f), f).not.toContain('/v1/retailers/me/reviews');
    }
  });

  it('google-business screen has no success path of its own; UNAVAILABLE is "Coming soon" with no action', () => {
    const src = read('app/growth/integrations/google-business.tsx');
    const unavailable = src.slice(
      src.indexOf("status.state === 'UNAVAILABLE'"),
      src.indexOf("status.state === 'LINKED'"),
    );
    expect(unavailable).toContain('Coming soon');
    expect(unavailable).not.toMatch(/onPress|GradientButton|AnimatedPressable/);
    // every state is read from the server; nothing hardcodes a connected/success state
    expect(src).not.toMatch(/configured:\s*true|connected:\s*true/);
    expect(src).toContain('googleBusinessApi.status()');
  });

  it('legacy token-paste GMB screen is gone and unreferenced (RC-101)', () => {
    expect(existsSync(join(__dirname, '..', 'app/growth/integrations/gmb.tsx'))).toBe(false);
    for (const f of [
      'app/_layout.tsx',
      'app/growth/ratings.tsx',
      'app/growth/index.tsx',
      'app/settings/index.tsx',
      'src/lib/api/growth.ts',
      'src/lib/api/index.ts',
      'src/components/SetupChecklist.tsx',
    ]) {
      if (!existsSync(join(__dirname, '..', f))) continue;
      const src = read(f);
      expect(src, f).not.toContain('configureGmb');
      expect(src, f).not.toContain('integrations/gmb');
    }
  });

  it('home mounts the setup checklist, which only asks the server for owners', () => {
    expect(read('app/(tabs)/index.tsx')).toContain('<SetupChecklist />');
    const src = read('src/components/SetupChecklist.tsx');
    expect(src).toContain("staffCan(staffRole, 'setup')");
    expect(src).toContain('enabled: allowed');
  });

  it('Settings has a Google Listing row; one client method writes the id', () => {
    expect(read('app/settings/index.tsx')).toContain('label="Google Listing"');
    expect(read('src/lib/api/growth.ts')).not.toContain('updateGooglePlaceId');
    expect(read('src/lib/api/retailer.ts')).toContain('/v1/retailers/reviews/google-place');
  });
});
