// Shopper Passport — OTP send/verify, session, stores, activity, wishlist,
// preferences + DPDP data routes. Split into domain modules under
// routes/public/passport/ (2026-09-03); shared helpers/constants live in
// passport-helpers.ts.
//
// Two verification channels, both backed by the existing msg91-otp.ts lib:
//   1. MSG91 web widget: the client loads the widget, sends OTP, verifies
//      the code client-side, and hands back the JWT access token. The API
//      re-verifies it server-side with verifyMsg91WidgetToken().
//   2. SMS fallback: the API generates + stores + sends the OTP via
//      sendOtpViaMsg91(), and verifies against the Redis entry.
//
// On successful verification: upsert CustomerAccount, mint a passport
// session (HttpOnly cookie), return { ok, account_id, is_new }.

import type { FastifyPluginAsync } from 'fastify';
import { passportActivityRoutes } from './passport/passport-activity.js';
import { passportDataRoutes } from './passport/passport-data.js';
import { passportOtpRoutes } from './passport/passport-otp.js';
import { passportPreferencesRoutes } from './passport/passport-preferences.js';
import { passportSessionRoutes } from './passport/passport-session.js';
import { passportStoresRoutes } from './passport/passport-stores.js';
import { passportWishlistRoutes } from './passport/passport-wishlist.js';

export const passportRoutes: FastifyPluginAsync = async (server) => {
  await server.register(passportOtpRoutes);
  await server.register(passportSessionRoutes);
  await server.register(passportStoresRoutes);
  await server.register(passportActivityRoutes);
  await server.register(passportWishlistRoutes);
  await server.register(passportPreferencesRoutes);
  await server.register(passportDataRoutes);
};
