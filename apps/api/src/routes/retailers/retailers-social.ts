import type { FastifyPluginAsync } from 'fastify';
import { retailersSocialAccountsRoutes } from './retailers-social/retailers-social-accounts.js';
import { retailersSocialConnectRoutes } from './retailers-social/retailers-social-connect.js';
import { retailersSocialPostsRoutes } from './retailers-social/retailers-social-posts.js';

// F-031 Social Media Publishing (Phase 1: Facebook Page).
// Phase 2: Added Instagram Business Account support.
// Retailer flows:
//   1. Connect: GET /retailers/me/social/connect → { auth_url, state } —
//      the mobile app opens auth_url in a browser (web page at /social/connect),
//      which redirects through the Meta login dialog. Meta redirects back to
//      the Kanchuki callback URL with ?code=&state=.
//   2. Callback: POST /retailers/me/social/callback { code, state } — exchange
//      the code for tokens, list the retailer's Pages, return them for the
//      web page to render a picker. Nothing is stored yet — the retailer
//      picks which Page to connect, then POSTs the choice:
//   3. POST /retailers/me/social/accounts { platform_account_id } — stores the
//      selected Page (encrypted token via F-012) under a new SocialAccount row.
//   4. POST /retailers/me/social/accounts/:id/posts — publish a post to the
//      connected Page (SINGLE_PRODUCT or COLLECTION_LINK).
//   5. GET /retailers/me/social/accounts (list, masked) + GET .../:id/posts (history)
//   6. DELETE /retailers/me/social/accounts/:id — disconnect.
//
// Security:
//   - OAuth `state` is a random opaque token stored in Redis (10 min TTL) and
//     bound to the retailer; the callback verifies it before doing anything.
//   - Tokens are stored encrypted (encryptSecret) and only masked previews
//     ever leave the API.
//   - Publish + disconnect are owner-only (staff get 403 via staffCanAccess).
//   - Every post stores a SocialPost history row with status POSTED/FAILED.
//
// Split into domain modules under routes/retailers/retailers-social/ (2026-09-03):
// connect / accounts / posts. Shared helpers live in retailers-social-helpers.ts.
export const retailersSocialRoutes: FastifyPluginAsync = async (server) => {
  await server.register(retailersSocialConnectRoutes);
  await server.register(retailersSocialAccountsRoutes);
  await server.register(retailersSocialPostsRoutes);
};
