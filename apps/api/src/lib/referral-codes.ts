// Retailer affiliate referral codes — the namespace authority (T3).
//
// WHY THIS FILE EXISTS AT ALL
//
// Two different "referral code" namespaces feed the SAME onboarding field. A
// prospective retailer types a code at signup; that code may have been given to
// them by:
//
//   1. a Kanchuki marketing agent (F-018, live since migration 039) — resolves
//      to `retailers.onboarded_by_id`, attributing the signup to internal sales;
//   2. another retailer, through the affiliate program (migration 109) — resolves
//      to a `ReferralConversion` and pays that retailer commission.
//
// They are different actors with different ledgers. So the two must be told
// apart RELIABLY, and shape is the only thing available at the point of entry:
// onboarding sends one opaque `referral_code` string. Looking one table up and
// then the other is not a solution — resolution order would silently decide
// which ledger gets paid, and nothing would ever report a mistake. That is the
// RC-027 failure shape (two things that look interchangeable and are not).
//
// THE NAMESPACES, AND WHY THEY CANNOT OVERLAP
//
//   F-018 staff/agent code   ^[0-9A-Z]{4,20}$   e.g. ROHAN1, KAN001
//     minted by generateStaffReferralCode() in routes/team/team-helpers.ts as
//     Math.random().toString(36).slice(2,8).toUpperCase() — base36, so the
//     result is alphanumeric ONLY and can never contain a hyphen.
//
//   Affiliate code           ^KAN-[0-9A-Z]{6}$  e.g. KAN-7F3QMP
//     minted here, from an ambiguity-free alphabet (no I/L/O/0/1) because these
//     get read aloud, retyped from a screenshot and shared over WhatsApp — the
//     spec assumes low link click-through for exactly that reason.
//
// The hyphen is the discriminator, and it is one-way: the affiliate pattern
// requires one, the staff pattern forbids one. `referral-codes.test.ts` asserts
// this by running the F-018 generator 20,000 times and matching every output
// against the affiliate pattern — that property is the reason
// `classifyReferralCode` may branch on shape at all.
//
// THE OTHER HALF OF THE GUARANTEE — a guard, not a hope
//
// The generator is not the only way a staff code comes into existence: it can
// also be set by hand (`referral_code: z.string().min(4).max(20)` on
// POST/PATCH /v1/team/members). A hand-typed `KAN-XXXXXX` would sit inside the
// affiliate namespace and shadow a real affiliate attribution. So
// routes/team/team-members.ts refuses a hyphen in that field, with the message
// naming the reservation. Automatic disjointness plus a guard on the manual path
// is the whole guarantee; neither alone is sufficient.
//
// Link scheme — deliberately NOT `/join`
//
// `apps/web/src/app/join/page.tsx` is the staff-invite bridge (`?token=…`) and
// calls notFound() when the token is missing, so the `/join?ref=…` form sketched
// in the spec would have 404'd every referral link. `?ref=` is also already
// spoken for: `apps/web/src/app/survey/SurveyForm.tsx` shares
// `https://kanchuki.com/for-retailers?ref={staffCode}` on WhatsApp today (with a
// stale .com domain — a separate pre-existing bug, not this change's). One param
// and one landing, two provably-disjoint shapes, is the smaller change than a
// second param or a second route. The `?ref=` capture itself is T4's job.

import { randomBytes } from 'node:crypto';

/** Prefix reserved for the retailer affiliate namespace. */
export const AFFILIATE_CODE_PREFIX = 'KAN';

/**
 * Ambiguity-free alphabet — no I, L, O, 0 or 1. These codes get typed from a
 * WhatsApp screenshot, so a code that can be misread is a support ticket. The
 * alphabet predates this file (it lived in the orphaned
 * growth-helpers.generateReferralCode) and is preserved byte-for-byte.
 */
export const AFFILIATE_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const AFFILIATE_CODE_LENGTH = 6;

/** The affiliate shape — a hyphen, which the staff namespace can never produce. */
export const AFFILIATE_CODE_PATTERN = new RegExp(
  `^${AFFILIATE_CODE_PREFIX}-[${AFFILIATE_CODE_ALPHABET}]{${AFFILIATE_CODE_LENGTH}}$`,
);

/**
 * The same shape with the hyphen DROPPED — `KAN7F3QMP`.
 *
 * Not a second accepted format: a minted code always has its hyphen, and this is
 * never a classification result. It exists because the hyphen is the ONLY thing
 * separating the two namespaces, so "what if the separator is not actually
 * required" has to be answered explicitly in two places rather than left to luck:
 *
 *   - the reserved-namespace guard refuses this shape too, so a hand-entered
 *     F-018 code can never take it (a 4–20 char field happily accepts `KAN7F3QMP`);
 *   - `classifyReferralCode` reports it INVALID rather than letting it fall
 *     through to the staff lookup, because an affiliate code typed without its
 *     hyphen is a typo, and resolving a typo against the other ledger is how
 *     attribution silently goes to the wrong actor.
 *
 * `KAN001` — the existing F-018 fixture — does NOT match this: `0` and `1` are
 * deliberately absent from the alphabet, which is why this rule can be strict
 * without narrowing the staff namespace.
 */
const AFFILIATE_CODE_WITHOUT_HYPHEN = new RegExp(
  `^${AFFILIATE_CODE_PREFIX}[${AFFILIATE_CODE_ALPHABET}]{${AFFILIATE_CODE_LENGTH}}$`,
);

/**
 * The F-018 staff shape. Alphanumeric only, 4–20 chars to match the zod bounds
 * already enforced on POST/PATCH /v1/team/members (`min(4).max(20)`).
 *
 * `KAN001` matches this and that is correct, not a bug: it is an F-018 code in
 * the existing fixtures (auth-otp-bypass.test.ts), and the affiliate guard is the
 * hyphen, not the prefix. A near-miss affiliate code such as a truncated
 * `KAN-7F3QM` contains a hyphen and therefore matches NEITHER pattern — it
 * classifies INVALID rather than silently falling through to the staff lookup.
 */
export const STAFF_CODE_PATTERN = /^[0-9A-Z]{4,20}$/;

export type ReferralCodeKind = 'AFFILIATE' | 'STAFF' | 'INVALID';

export interface ClassifiedReferralCode {
  kind: ReferralCodeKind;
  /** Trimmed, inner-whitespace-stripped, upper-cased. Empty when INVALID. */
  code: string;
}

/**
 * Normalise a code the way a human typed it: uppercase, and strip ALL internal
 * whitespace as well as the ends. WhatsApp screenshots of codes are commonly
 * retyped with a space where a hyphen or nothing was; spaces are never part of
 * either namespace, so removing them is strictly lossless.
 */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase();
}

/**
 * Decide which ledger a typed code belongs to, from its shape.
 *
 * INVALID is returned for anything that matches neither namespace — including a
 * hyphen-bearing malformed affiliate code. Callers must treat INVALID as "no
 * attribution", never as a fallback to the other namespace; silently retrying a
 * malformed affiliate code against the staff table is how a typo becomes a
 * wrong-actor attribution.
 */
export function classifyReferralCode(raw: string): ClassifiedReferralCode {
  const code = normalizeReferralCode(raw);
  if (AFFILIATE_CODE_PATTERN.test(code)) return { kind: 'AFFILIATE', code };
  // An affiliate code with its hyphen dropped must NOT reach the staff lookup.
  // It is a typo, and a lookup miss there is a silent wrong-ledger resolution;
  // INVALID makes T4 able to tell the retailer the code itself is malformed.
  if (AFFILIATE_CODE_WITHOUT_HYPHEN.test(code)) return { kind: 'INVALID', code: '' };
  if (STAFF_CODE_PATTERN.test(code)) return { kind: 'STAFF', code };
  // `code` is empty on INVALID even when the input was not: the field means
  // "look this up", and there is nothing to look up. A caller that wants the
  // raw string for a log or an error message still has it.
  return { kind: 'INVALID', code: '' };
}

/**
 * True when a value would land in the affiliate namespace — the guard for the
 * hand-editable F-018 field on /v1/team/members.
 *
 * Deliberately broader than AFFILIATE_CODE_PATTERN, in both directions:
 *
 *   - ANY hyphen is refused, not just a well-formed one. A hand-typed
 *     `KAN-typo` is not a valid affiliate code either, but letting it into the
 *     staff field creates a value that is unclassifiable AND indistinguishable
 *     from the affiliate prefix to a human reader.
 *   - the hyphen-DROPPED shape is refused too (`KAN7F3QMP`). Without this, the
 *     whole guarantee rested on the hyphen being mandatory in the pattern — and
 *     nothing stopped that requirement from being relaxed later. Measured, not
 *     assumed: with `-?` in AFFILIATE_CODE_PATTERN, an earlier version of this
 *     guard let `KAN7F3QMP` into the staff field while classification sent it to
 *     the affiliate ledger. This line is what makes the separation hold even if
 *     the pattern's strictness changes.
 *
 * The 4–20 char F-018 field accepts both shapes, so the refusal has to live here.
 */
export function isReservedForAffiliateNamespace(raw: string): boolean {
  const code = normalizeReferralCode(raw);
  return code.includes('-') || AFFILIATE_CODE_WITHOUT_HYPHEN.test(code);
}

/** Mint an affiliate code. Uniqueness is the DB's job (referral_codes.code). */
export function generateAffiliateCode(): string {
  const rand = randomBytes(AFFILIATE_CODE_LENGTH);
  let suffix = '';
  // Iterate the buffer directly: `rand[i]` is `number | undefined` under
  // noUncheckedIndexedAccess, and `charAt` keeps the indexed lookup non-null too.
  for (const byte of rand)
    suffix += AFFILIATE_CODE_ALPHABET.charAt(byte % AFFILIATE_CODE_ALPHABET.length);
  return `${AFFILIATE_CODE_PREFIX}-${suffix}`;
}

/**
 * The landing a referral link points at.
 *
 * `/for-retailers` is the retailer-facing marketing page and the one the F-018
 * links already use, so both namespaces share a single capture point (T4 reads
 * `?ref=` and classifies it). Not `/join` — see the header: that route is the
 * staff-invite bridge and 404s without a `token`.
 *
 * WEB_URL handling mirrors lib/store-urls.ts (empty base ⇒ a relative path) so
 * there is one convention for web-origin building. WEB_URL is set to
 * `https://kanchuki.app` on the API service in docs/DEPLOY.md; if it were ever
 * unset the whole app's store links break the same way, so this is a global
 * misconfiguration rather than a referral-specific one — and the returned
 * `link` is only ever a display/share value, never what the API resolves against.
 */
export function buildReferralLink(code: string): string {
  const base = process.env.WEB_URL ?? '';
  return `${base}/for-retailers?ref=${encodeURIComponent(normalizeReferralCode(code))}`;
}

/** The retailer affiliate landing path, exported for T4's capture point + tests. */
export const REFERRAL_LANDING_PATH = '/for-retailers';

/** The query param both referral namespaces use on that landing. */
export const REFERRAL_LINK_PARAM = 'ref';
