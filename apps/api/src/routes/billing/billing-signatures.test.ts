import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let secret: string | null = 'key_secret';
vi.mock('@kanchuki/db', () => ({
  getSecret: vi.fn(async () => secret),
  prisma: {},
}));

import { verifyOrderSignature, verifyPaymentLinkSignature } from './billing-helpers.js';

const sign = (msg: string, key = 'key_secret') =>
  createHmac('sha256', key).update(msg).digest('hex');

beforeEach(() => {
  secret = 'key_secret';
});

describe('verifyPaymentLinkSignature', () => {
  const base = { linkId: 'plink_1', paymentId: 'pay_1', referenceId: 'ref_1' };

  it('accepts the documented 4-part signature when status is paid', async () => {
    const signature = sign('plink_1|ref_1|paid|pay_1');
    await expect(verifyPaymentLinkSignature({ ...base, status: 'paid', signature })).resolves.toBe(
      true,
    );
  });

  it('rejects a validly signed callback whose link is not paid', async () => {
    const signature = sign('plink_1|ref_1|created|pay_1');
    await expect(
      verifyPaymentLinkSignature({ ...base, status: 'created', signature }),
    ).resolves.toBe(false);
  });

  it('accepts the legacy 2-part form, rejects tampering', async () => {
    const signature = sign('plink_1|pay_1');
    await expect(verifyPaymentLinkSignature({ ...base, signature })).resolves.toBe(true);
    await expect(
      verifyPaymentLinkSignature({ ...base, paymentId: 'pay_2', signature }),
    ).resolves.toBe(false);
  });

  it('rejects a forged signature made with an EMPTY key when no secret is configured', async () => {
    secret = null;
    const forged = sign('plink_1|pay_1', '');
    await expect(verifyPaymentLinkSignature({ ...base, signature: forged })).resolves.toBe(false);
  });

  it('rejects wrong-length / garbage signatures without throwing', async () => {
    await expect(verifyPaymentLinkSignature({ ...base, signature: 'abc' })).resolves.toBe(false);
  });
});

describe('verifyOrderSignature', () => {
  it('accepts a correct signature and rejects a wrong one', async () => {
    await expect(verifyOrderSignature('order_1', 'pay_1', sign('order_1|pay_1'))).resolves.toBe(
      true,
    );
    await expect(verifyOrderSignature('order_1', 'pay_2', sign('order_1|pay_1'))).resolves.toBe(
      false,
    );
  });

  it('is not forgeable with an empty key when the secret is missing', async () => {
    secret = null;
    await expect(verifyOrderSignature('order_1', 'pay_1', sign('order_1|pay_1', ''))).resolves.toBe(
      false,
    );
  });
});
