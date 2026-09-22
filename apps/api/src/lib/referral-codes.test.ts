// The namespace guarantee, and the proof that it holds.
//
// The risk this file exists to retire: two referral namespaces (F-018 agent
// codes, retailer affiliate codes) reach the API through one opaque
// `referral_code` string at onboarding. If their shapes could ever overlap, the
// classifier would hand the attribution to the wrong ledger and pay the wrong
// actor, with nothing anywhere reporting a problem.
//
// Shape-disjointness is therefore load-bearing behaviour, not a formatting
// detail, and it is asserted two ways:
//
//   1. exhaustively over the F-018 generator's OUTPUT SPACE (every string it can
//      produce is `[0-9A-Z]{6}` — base36, uppercased — so sampling that space
//      20,000 times is sampling the generator's real range); and
//   2. as a source contract, below, because the generator lives in a route module
//      that pulls in the admin router and Redis clients at import time. Reading
//      its source is how `retired-tryon-guard.test.ts` pins its own contract too.
//
// (2) is what makes (1) meaningful: (1) says "no base36 code collides", (2) says
// "the generator still emits base36 only". Either alone is a half-proof, and that
// pairing is deliberate — if someone re-implements the F-018 generator, (2) fails
// and forces a re-read of lib/referral-codes.ts rather than a silent overlap.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  AFFILIATE_CODE_ALPHABET,
  AFFILIATE_CODE_PATTERN,
  REFERRAL_LANDING_PATH,
  REFERRAL_LINK_PARAM,
  STAFF_CODE_PATTERN,
  buildReferralLink,
  classifyReferralCode,
  generateAffiliateCode,
  isReservedForAffiliateNamespace,
  normalizeReferralCode,
} from './referral-codes.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('referral-code namespaces are disjoint by shape', () => {
  it('no code the F-018 staff generator can produce matches the affiliate pattern', () => {
    // The staff generator is Math.random().toString(36).slice(2,8).toUpperCase()
    // — base36 uppercased, i.e. exactly [0-9A-Z]{6}. Sample that whole space.
    const BASE36 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let samples = 0;
    for (let i = 0; i < 20_000; i += 1) {
      let code = '';
      for (let c = 0; c < 6; c += 1) code += BASE36.charAt(Math.floor(Math.random() * 36));
      expect(AFFILIATE_CODE_PATTERN.test(code), `${code} must stay in the staff namespace`).toBe(
        false,
      );
      expect(STAFF_CODE_PATTERN.test(code), `${code} must match the staff shape`).toBe(true);
      samples += 1;
    }
    expect(samples).toBe(20_000);
  });

  it('every affiliate-shaped code is refused by the staff shape (the hyphen is the discriminator)', () => {
    for (let i = 0; i < 500; i += 1) {
      const code = generateAffiliateCode();
      expect(AFFILIATE_CODE_PATTERN.test(code), `${code} should be an affiliate code`).toBe(true);
      // The regexes must not merely usually differ — the staff shape has no
      // hyphen at all, so an affiliate code can never satisfy both.
      expect(STAFF_CODE_PATTERN.test(code), `${code} must not match the staff shape`).toBe(false);
    }
  });

  it('refuses to let the separator be optional — a hyphen-stripped affiliate code is not a staff code', () => {
    // The falsification that found this: with `-?` in AFFILIATE_CODE_PATTERN,
    // `KAN7F3QMP` matched the affiliate pattern (wrong ledger for a typo) and the
    // hyphen-only guard let it into the F-018 field. Pinning the requirement from
    // the outside means relaxing the pattern can never be silent again.
    const minted = generateAffiliateCode();
    expect(classifyReferralCode(minted).kind).toBe('AFFILIATE');
    expect(classifyReferralCode(minted.replace('-', ''))).toEqual({ kind: 'INVALID', code: '' });
    expect(isReservedForAffiliateNamespace(minted.replace('-', ''))).toBe(true);
  });

  it('keeps the F-018 generator emitting base36-only, per its source', () => {
    // Source contract for the test above. The generator is in a route module
    // whose import chain reaches the admin router; reading the source keeps this
    // test dependency-free while still failing if the generator is replaced.
    const src = readFileSync(join(REPO_ROOT, 'apps/api/src/routes/team/team-helpers.ts'), 'utf8');
    const fn = src.match(/export function generateReferralCode\(\)[^{]*\{([\s\S]*?)\n\}/);
    expect(fn, 'generateReferralCode() should still exist in team-helpers.ts').not.toBeNull();
    const body = fn?.[1] ?? '';
    expect(body).toContain('toString(36)');
    expect(body).toContain('toUpperCase()');
    // No hyphen literal, and no prefix — either would put the staff namespace
    // inside the affiliate one and invalidate classifyReferralCode's branching.
    expect(body).not.toContain("'-'");
    expect(body).not.toContain('"-"');
  });
});

describe('generateAffiliateCode', () => {
  it('always produces KAN- + 6 ambiguity-free chars', () => {
    for (let i = 0; i < 2_000; i += 1) {
      const code = generateAffiliateCode();
      expect(AFFILIATE_CODE_PATTERN.test(code), `${code} should match the pattern`).toBe(true);
      const suffix = code.slice(code.indexOf('-') + 1);
      for (const ch of suffix) {
        expect(AFFILIATE_CODE_ALPHABET).toContain(ch);
      }
    }
  });

  it('never emits a read-aloud-ambiguous character', () => {
    // I/L/O/0/1 are the whole reason this alphabet exists — the codes are shared
    // as WhatsApp screenshots and retyped by hand.
    const joined = Array.from({ length: 500 }, () => generateAffiliateCode()).join('');
    const suffixes = Array.from({ length: 500 }, () => generateAffiliateCode().slice(4)).join('');
    for (const ch of 'ILO01') {
      expect(suffixes, `suffixes must never contain ${ch}`).not.toContain(ch);
    }
    expect(joined).not.toContain('O');
  });
});

describe('classifyReferralCode', () => {
  const cases: { raw: string; kind: 'AFFILIATE' | 'STAFF' | 'INVALID' }[] = [
    { raw: 'KAN-7F3QMP', kind: 'AFFILIATE' },
    // Whitespace and case are what a human types — both must normalise away.
    { raw: '  kan-7f3qmp  ', kind: 'AFFILIATE' },
    { raw: 'KAN - 7F3QMP', kind: 'AFFILIATE' },
    // F-018 codes, including the one that looks like the affiliate prefix.
    { raw: 'ROHAN1', kind: 'STAFF' },
    { raw: 'kan001', kind: 'STAFF' },
    // The SurveyForm fallback for an agent with no code yet — it is a staff
    // attempt (and a lookup miss), never an affiliate one.
    { raw: 'STAFF', kind: 'STAFF' },
    // Malformed affiliate codes are INVALID, NOT staff. Falling back to the
    // staff lookup here is how a typo would become a wrong-actor attribution.
    { raw: 'KAN-7F3QM', kind: 'INVALID' },
    { raw: 'KAN-7F3QMPX', kind: 'INVALID' },
    { raw: 'KAN-7F3QM0', kind: 'INVALID' }, // '0' is not in the alphabet
    { raw: 'KAN_7F3QMP', kind: 'INVALID' },
    { raw: 'ABC', kind: 'INVALID' }, // below the F-018 min length
    { raw: 'A'.repeat(21), kind: 'INVALID' }, // above the F-018 max length
    { raw: '', kind: 'INVALID' },
    { raw: '   ', kind: 'INVALID' },
  ];

  for (const { raw, kind } of cases) {
    it(`classifies ${JSON.stringify(raw)} as ${kind}`, () => {
      expect(classifyReferralCode(raw).kind).toBe(kind);
    });
  }

  it('returns the normalised code so callers look up what they validated', () => {
    expect(classifyReferralCode('  kan-7f3qmp ').code).toBe('KAN-7F3QMP');
    // INVALID carries an empty code: callers must not be handed something that
    // looks queryable when the shape did not validate.
    expect(classifyReferralCode('KAN-7F3QM').code).toBe('');
    expect(classifyReferralCode('   ').code).toBe('');
  });
});

describe('isReservedForAffiliateNamespace', () => {
  it('refuses any hyphen, well-formed or not', () => {
    expect(isReservedForAffiliateNamespace('KAN-7F3QMP')).toBe(true);
    expect(isReservedForAffiliateNamespace('kan-typo')).toBe(true);
    expect(isReservedForAffiliateNamespace('MY-CODE')).toBe(true);
  });

  it('refuses an affiliate code typed without its hyphen, since the field cannot tell', () => {
    expect(isReservedForAffiliateNamespace('KAN7F3QMP')).toBe(true);
    expect(isReservedForAffiliateNamespace(' kan7f3qmp ')).toBe(true);
  });

  it('allows the codes F-018 actually generates', () => {
    expect(isReservedForAffiliateNamespace('ROHAN1')).toBe(false);
    // The existing F-018 fixture starts with KAN and MUST keep working — `0` and
    // `1` are absent from the affiliate alphabet, so this is not the reserved
    // shape. This case is why the guard could not simply reserve the prefix.
    expect(isReservedForAffiliateNamespace('KAN001')).toBe(false);
    expect(classifyReferralCode('KAN001').kind).toBe('STAFF');
  });
});

describe('normalizeReferralCode', () => {
  it('strips ends and inner whitespace, and upper-cases', () => {
    expect(normalizeReferralCode('  kan-7f3 qmp\n')).toBe('KAN-7F3QMP');
    expect(normalizeReferralCode('rohan1')).toBe('ROHAN1');
  });
});

describe('buildReferralLink', () => {
  const OLD_WEB_URL = process.env.WEB_URL;

  afterAll(() => {
    // Assignment-only restore (biome bans `delete process.env.X`), matching
    // lib/store-urls.test.ts.
    process.env.WEB_URL = OLD_WEB_URL ?? '';
  });

  it('points at the shared retailer landing with the code as ?ref=', () => {
    process.env.WEB_URL = 'https://kanchuki.app';
    expect(buildReferralLink('KAN-7F3QMP')).toBe(
      `https://kanchuki.app${REFERRAL_LANDING_PATH}?${REFERRAL_LINK_PARAM}=KAN-7F3QMP`,
    );
  });

  it('never points at /join, which is the staff-invite bridge and 404s without a token', () => {
    process.env.WEB_URL = 'https://kanchuki.app';
    // apps/web/src/app/join/page.tsx calls notFound() when `token` is absent, so
    // a /join?ref=… referral link would be a dead link for every recipient.
    expect(buildReferralLink('KAN-7F3QMP')).not.toContain('/join');
  });

  it('normalises and encodes whatever it is handed', () => {
    process.env.WEB_URL = 'https://kanchuki.app';
    expect(buildReferralLink(' kan-7f3qmp ')).toContain('ref=KAN-7F3QMP');
  });

  it('builds a relative link when WEB_URL is unset (mirrors store-urls)', () => {
    process.env.WEB_URL = '';
    expect(buildReferralLink('KAN-7F3QMP')).toBe('/for-retailers?ref=KAN-7F3QMP');
  });
});
