// RazorpayX Payouts client — T7 of
// docs/tasks/referral-program-retailer-affiliate.md.
//
// WHAT THIS IS
//
// Thin raw-fetch wrappers over the four RazorpayX endpoints T7 needs:
//   POST /v1/contacts               — payee record (one per referrer)
//   POST /v1/fund_accounts          — destination: bank_account | vpa (UPI)
//   PATCH /v1/fund_accounts/:id     — deactivate on account replacement
//   POST /v1/payouts                — the money move
//   GET  /v1/payouts/:id            — reconciliation when a webhook is missed
//
// Raw fetch, not the SDK — same call as billing-helpers.ts, same reasoning
// (5 endpoints, SDK adds a dep). Every call is bounded by AbortSignal.timeout
// (RC-011: an unbounded server-side Razorpay call outlives the client's abort
// and produces a misleading "server not running" error).
//
// KEYS: RazorpayX payouts run on the SAME api.razorpay.com/v1 keys as the
// payments side, so RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are reused via
// getSecret (Admin → Integrations row, env fallback). The debit account and
// the payouts webhook secret are payouts-specific:
//   RAZORPAYX_ACCOUNT_NUMBER   — business account to debit (test ≠ live)
//   RAZORPAYX_WEBHOOK_SECRET   — payouts webhook signing secret
// Missing keys throw — a payout call without them is a configuration error
// that must fail loudly, never silently skip (money must never be *forgotten*).
import { getSecret } from '@kanchuki/db';

const RAZORPAYX_TIMEOUT_MS = 20_000;

/** RazorpayX API base — same host/v1 as the payments API. */
const RAZORPAYX_BASE = 'https://api.razorpay.com/v1';

async function razorpayx<T>(path: string, init?: RequestInit): Promise<T> {
  const keyId = (await getSecret('RAZORPAY_KEY_ID')) ?? '';
  const keySecret = (await getSecret('RAZORPAY_KEY_SECRET')) ?? '';
  if (!keyId || !keySecret) {
    throw new Error('RazorpayX keys not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }
  const res = await fetch(`${RAZORPAYX_BASE}${path}`, {
    ...init,
    // Never override a caller-provided signal; default to a bounded timeout.
    signal: init?.signal ?? AbortSignal.timeout(RAZORPAYX_TIMEOUT_MS),
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`RazorpayX ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** The RazorpayX business account payouts debit. Required — throws if unset. */
export async function requireRazorpayxAccountNumber(): Promise<string> {
  const account = (await getSecret('RAZORPAYX_ACCOUNT_NUMBER')) ?? '';
  if (!account) {
    throw new Error('RazorpayX account number not configured (RAZORPAYX_ACCOUNT_NUMBER)');
  }
  return account;
}

// ─── Entities ─────────────────────────────────────────────────────

export interface RazorpayxContact {
  id: string;
  name: string;
  contact?: string; // phone
  type?: string;
}

export interface RazorpayxFundAccount {
  id: string;
  contact_id: string;
  account_type: 'bank_account' | 'vpa';
  active: boolean;
}

export type RazorpayxPayoutStatus =
  | 'queued'
  | 'pending'
  | 'rejected'
  | 'initiated'
  | 'processed'
  | 'canceled'
  | 'failed'
  | 'reversed';

export interface RazorpayxPayout {
  id: string;
  status: RazorpayxPayoutStatus;
  amount: number;
  fees: number;
  tax: number;
  utr: string | null;
  reference_id: string | null;
  status_details?: { reason?: string; description?: string; source?: string } | null;
}

// ─── Contact + fund account ──────────────────────────────────────

/**
 * Create the payee contact. RazorpayX has no natural-key dedupe for contacts,
 * so the caller must only invoke this when NO payout-account row exists yet —
 * the row is the dedupe (unique retailer_id). reference_id ties the contact to
 * our retailer id for dashboard readability.
 */
export function createContact(
  name: string,
  phone: string | null,
  referenceId: string,
): Promise<RazorpayxContact> {
  return razorpayx<RazorpayxContact>('/contacts', {
    method: 'POST',
    body: JSON.stringify({
      name,
      ...(phone ? { contact: phone } : {}),
      type: 'referral_partner',
      reference_id: referenceId,
      notes: { source: 'kanchuki_referral' },
    }),
  });
}

/**
 * Create a bank-account fund account. RazorpayX validates the IFSC + account
 * number and rejects duplicates for the same contact.
 */
export function createBankFundAccount(
  contactId: string,
  bank: { name: string; ifsc: string; account_number: string },
): Promise<RazorpayxFundAccount> {
  return razorpayx<RazorpayxFundAccount>('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify({
      contact_id: contactId,
      account_type: 'bank_account',
      bank_account: { name: bank.name, ifsc: bank.ifsc, account_number: bank.account_number },
    }),
  });
}

/** Create a VPA (UPI ID) fund account. */
export function createVpaFundAccount(
  contactId: string,
  vpa: string,
): Promise<RazorpayxFundAccount> {
  return razorpayx<RazorpayxFundAccount>('/fund_accounts', {
    method: 'POST',
    body: JSON.stringify({
      contact_id: contactId,
      account_type: 'vpa',
      vpa: { address: vpa },
    }),
  });
}

/** Deactivate a fund account (account replacement — RazorpayX has no update). */
export function deactivateFundAccount(fundAccountId: string): Promise<RazorpayxFundAccount> {
  return razorpayx<RazorpayxFundAccount>(`/fund_accounts/${fundAccountId}`, {
    method: 'PATCH',
    body: JSON.stringify({ active: false }),
  });
}

// ─── Payouts ─────────────────────────────────────────────────────

/**
 * Create a payout. `idempotencyKey` is MANDATORY (RazorpayX enforces the
 * X-Payout-Idempotency header on all payout requests since 2025-03-15) and
 * must be STABLE across retries of the same logical payout — the caller reads
 * it from the referral_payouts row, never generates it per attempt. A retried
 * request must also carry the byte-identical body, so amount/narration here
 * must be derived purely from stored values.
 *
 * `amount` is the NET amount in paise (gross − TDS) — the money actually
 * landing in the payee's account. The TDS slice is recorded on the row, not
 * sent: sending gross would count the withheld tax as "paid" and repay it in
 * the next batch.
 */
export async function createPayout(params: {
  fundAccountId: string;
  /** NET amount in paise (RazorpayX minimum is 100). */
  amount: number;
  idempotencyKey: string;
  referenceId: string;
  narration: string;
}): Promise<RazorpayxPayout> {
  const accountNumber = await requireRazorpayxAccountNumber();
  const { fundAccountId, amount, idempotencyKey, referenceId, narration } = params;
  return razorpayx<RazorpayxPayout>('/payouts', {
    method: 'POST',
    headers: {
      // Mandatory since 2025-03-15. 4-36 chars; alphanumerics, hyphen,
      // underscore, space.
      'X-Payout-Idempotency': idempotencyKey,
    },
    body: JSON.stringify({
      account_number: accountNumber,
      fund_account_id: fundAccountId,
      amount,
      currency: 'INR',
      mode: 'IMPS',
      purpose: 'payout',
      queue_if_low_balance: true,
      reference_id: referenceId,
      narration: narration.slice(0, 30),
      notes: { source: 'kanchuki_referral_payout' },
    }),
  });
}

/**
 * Fetch a payout — reconciliation when a webhook is missed. Returns the full
 * entity so the caller can apply the same terminal-state transitions as the
 * webhook handler.
 */
export function fetchPayout(razorpayxPayoutId: string): Promise<RazorpayxPayout> {
  return razorpayx<RazorpayxPayout>(`/payouts/${razorpayxPayoutId}`);
}
