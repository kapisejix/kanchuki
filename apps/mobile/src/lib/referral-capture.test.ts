import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureReferralFromUrl,
  clearCapturedReferralCode,
  getCapturedReferralCode,
  parseReferralCode,
} from './referral-capture';

// In-memory stand-in for the SecureStore-backed storage module.
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('./storage', () => ({
  getItem: async (k: string) => store.get(k) ?? null,
  setItem: async (k: string, v: string) => void store.set(k, v),
  deleteItem: async (k: string) => void store.delete(k),
}));

beforeEach(() => store.clear());

describe('parseReferralCode', () => {
  it.each([
    ['kanchuki://onboarding?ref=KAN-7F3QMP', 'KAN-7F3QMP'],
    ['kanchuki://onboarding?x=1&ref=sharma21', 'SHARMA21'], // uppercased, any position
    ['kanchuki://onboarding?ref=%20ab12%20', 'AB12'], // decoded + trimmed
  ])('%s -> %s', (url, code) => expect(parseReferralCode(url)).toBe(code));

  it.each([
    null,
    'kanchuki://onboarding',
    'kanchuki://onboarding?ref=',
    'kanchuki://onboarding?ref=%E0%A4', // malformed escape
    'kanchuki://onboarding?ref=<script>',
    `kanchuki://onboarding?ref=${'A'.repeat(21)}`,
    'kanchuki://onboarding?preref=ABCD', // not the ref param
  ])('ignores %s', (url) => expect(parseReferralCode(url)).toBeNull());
});

describe('captured code', () => {
  it('round-trips a captured code and clears it', async () => {
    await captureReferralFromUrl('kanchuki://onboarding?ref=KAN-7F3QMP');
    expect(await getCapturedReferralCode()).toBe('KAN-7F3QMP');
    await clearCapturedReferralCode();
    expect(await getCapturedReferralCode()).toBeNull();
  });

  it('a link without a code does not wipe one already captured', async () => {
    await captureReferralFromUrl('kanchuki://onboarding?ref=KAN-7F3QMP');
    await captureReferralFromUrl('kanchuki://join?token=abc');
    expect(await getCapturedReferralCode()).toBe('KAN-7F3QMP');
  });

  it('expires after 30 days', async () => {
    await captureReferralFromUrl('kanchuki://onboarding?ref=KAN-7F3QMP');
    const later = Date.now() + 31 * 24 * 60 * 60 * 1000;
    expect(await getCapturedReferralCode(later)).toBeNull();
  });

  it('treats corrupt storage as no code', async () => {
    store.set('pending_referral_code', '{not json');
    expect(await getCapturedReferralCode()).toBeNull();
  });
});
