import { decryptSecret, encryptSecret, maskSecret, prisma } from '@kanchuki/db';
// Auto-split from checkout.ts (scripts/split-checkout-routes.mjs) — route bodies verbatim.
import type { FastifyPluginAsync } from 'fastify';
import { supabase } from '../../index.js';
import { hasFeature } from '../../lib/features.js';
import { isMsg91OtpConfigured, verifyStoredOtp } from '../../lib/msg91-otp.js';
import {
  featureUnavailable,
  forbidden,
  notFound,
  validationError,
} from '../../plugins/error-handler.js';
import { ConnectPaymentAccountSchema, razorpayAsRetailer } from './checkout-helpers.js';

// Step-up OTP verification (SECURITY §11.8). The OTP comes from /v1/auth/otp/send,
// which issues it via MSG91 and stores it in Redis (2026-08-12) — verify against
// that entry first. The step-up OTP may have been requested with purpose
// 'stepup' (future UIs) or through the default login slot (current flows), so
// check both. The legacy Supabase-issued path runs ONLY when MSG91 is not
// configured on the API — production never issues Supabase OTPs, so there is
// no second oracle to fall back to.
async function verifyStepUpOtp(phone: string, otp: string): Promise<boolean> {
  const stepup = await verifyStoredOtp(phone, otp, 'stepup');
  if (stepup !== 'absent') return stepup === 'verified';
  const login = await verifyStoredOtp(phone, otp, 'login');
  if (login !== 'absent') return login === 'verified';
  if (isMsg91OtpConfigured()) return false;
  const e164 = `+91${phone}`;
  const { error } = await supabase.auth.verifyOtp({ phone: e164, token: otp, type: 'sms' });
  return !error;
}

export const checkoutPaymentAccountRoutes: FastifyPluginAsync = async (server) => {
  // ═══════════════════════════════════════════════════════════════
  //  RETAILER PAYMENT ACCOUNT (authenticated, retailer-only)
  // ═══════════════════════════════════════════════════════════════

  // ── GET /retailers/payment-account ──────────────────────────────
  // Returns payment account status with masked credentials.
  // F-013: gated behind CHECKOUT_CART feature.
  server.get('/retailers/payment-account', async (request) => {
    if (!(await hasFeature(request.retailerId, 'CHECKOUT_CART'))) {
      return { data: null };
    }
    const account = await prisma.retailerPaymentAccount.findUnique({
      where: { retailer_id: request.retailerId },
      select: {
        id: true,
        payment_mode: true,
        razorpay_key_id: true,
        is_active: true,
        verified_at: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!account) {
      return { data: null };
    }

    // Mask the key_id: show last 4 chars only
    const maskedKeyId = account.razorpay_key_id ? `••••${account.razorpay_key_id.slice(-4)}` : null;

    return {
      data: {
        ...account,
        razorpay_key_id: maskedKeyId,
        has_payment_account: true,
      },
    };
  });

  // ── POST /retailers/payment-account ─────────────────────────────
  // Connect or update Razorpay account. Step-up OTP required for updates.
  // F-013: gated behind CHECKOUT_CART feature.
  server.post('/retailers/payment-account', async (request) => {
    if (!(await hasFeature(request.retailerId, 'CHECKOUT_CART'))) {
      throw featureUnavailable('Shopping Cart / Checkout');
    }
    const body = ConnectPaymentAccountSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid input');
    }

    const { razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, otp } = body.data;

    // Step-up re-auth: if an account already exists, require OTP verification
    const existing = await prisma.retailerPaymentAccount.findUnique({
      where: { retailer_id: request.retailerId },
    });

    if (existing?.is_active) {
      // SECURITY §11.8: Changing an active payment account requires step-up re-auth
      if (!otp) {
        throw validationError(
          'OTP verification required to change payment account. Request a new OTP via /auth/otp.',
        );
      }

      // Step-up OTP verification (SECURITY §11.8) — MSG91-issued via
      // /v1/auth/otp/send, checked server-side.
      const retailer = await prisma.retailer.findUnique({
        where: { id: request.retailerId },
        select: { phone: true },
      });
      if (!retailer) throw notFound('Retailer');

      if (!(await verifyStepUpOtp(retailer.phone, otp))) {
        throw validationError('Invalid or expired OTP. Request a new one via /auth/otp.');
      }
    }

    // Verify the credentials work by making a test call to Razorpay
    try {
      await razorpayAsRetailer(
        {
          razorpay_key_id,
          razorpay_key_secret_encrypted: encryptSecret(razorpay_key_secret),
        },
        '/payments?count=1',
      );
    } catch {
      throw validationError(
        'Invalid Razorpay credentials. Please check your Key ID and Key Secret.',
      );
    }

    const encryptedKeySecret = encryptSecret(razorpay_key_secret);
    const encryptedWebhookSecret = razorpay_webhook_secret
      ? encryptSecret(razorpay_webhook_secret)
      : (existing?.razorpay_webhook_secret_encrypted ?? null);

    const account = await prisma.retailerPaymentAccount.upsert({
      where: { retailer_id: request.retailerId },
      create: {
        retailer_id: request.retailerId,
        payment_mode: 'DIRECT',
        razorpay_key_id,
        razorpay_key_secret_encrypted: encryptedKeySecret,
        razorpay_webhook_secret_encrypted: encryptedWebhookSecret,
        is_active: true,
        verified_at: new Date(),
      },
      update: {
        razorpay_key_id,
        razorpay_key_secret_encrypted: encryptedKeySecret,
        razorpay_webhook_secret_encrypted: encryptedWebhookSecret,
        is_active: true,
        verified_at: new Date(),
      },
      select: {
        id: true,
        payment_mode: true,
        razorpay_key_id: true,
        is_active: true,
        verified_at: true,
        updated_at: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: request.retailerId,
        actor_type: 'retailer',
        action: 'CONNECT_PAYMENT_ACCOUNT',
        resource_type: 'RetailerPaymentAccount',
        resource_id: account.id,
        metadata: { payment_mode: account.payment_mode },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: request.retailerId }, 'Payment account connected');

    return {
      data: {
        ...account,
        razorpay_key_id: `••••${account.razorpay_key_id?.slice(-4)}`,
      },
    };
  });

  // ── DELETE /retailers/payment-account ───────────────────────────
  // Disconnect Razorpay account. Step-up OTP required.
  // F-013: gated behind CHECKOUT_CART feature.
  server.delete('/retailers/payment-account', async (request) => {
    if (!(await hasFeature(request.retailerId, 'CHECKOUT_CART'))) {
      throw featureUnavailable('Shopping Cart / Checkout');
    }
    const existing = await prisma.retailerPaymentAccount.findUnique({
      where: { retailer_id: request.retailerId },
    });
    if (!existing) throw notFound('Payment account');

    // SECURITY §11.8: Step-up re-auth required to disconnect
    // Verify OTP from query parameter (DELETE body is not reliably supported)
    const otp = (request.query as { otp?: string }).otp;
    if (!otp || !/^\d{6}$/.test(otp)) {
      throw validationError(
        'OTP verification required to disconnect payment account. Request a new OTP via /auth/otp.',
      );
    }

    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { phone: true },
    });
    if (!retailer) throw notFound('Retailer');

    if (!(await verifyStepUpOtp(retailer.phone, otp))) {
      throw validationError('Invalid or expired OTP. Request a new one via /auth/otp.');
    }

    // Delete the encrypted secrets immediately (not soft-delete — SECURITY §11.4)
    await prisma.retailerPaymentAccount.delete({
      where: { retailer_id: request.retailerId },
    });

    await prisma.auditLog.create({
      data: {
        actor_id: request.retailerId,
        actor_type: 'retailer',
        action: 'DISCONNECT_PAYMENT_ACCOUNT',
        resource_type: 'RetailerPaymentAccount',
        resource_id: existing.id,
        metadata: { payment_mode: existing.payment_mode },
        ip_address: request.ip,
      },
    });

    request.log.info({ retailer_id: request.retailerId }, 'Payment account disconnected');

    return { data: { disconnected: true } };
  });
};
