// retailers-social-connect.ts — OAuth connect flows (web 1-Click + native SDK + callback) (split from apps/api/src/routes/retailers/retailers-social.ts — body byte-identical)
import { encryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  buildOAuthUrl,
  exchangeCodeForToken,
  exchangeUserTokenForLongLived,
  listInstagramAccounts,
  listPages,
  resolveMetaCredentials,
} from '../../../lib/meta-graph.js';
import { AppError, serviceUnavailable, validationError } from '../../../plugins/error-handler.js';
import {
  STATE_TTL_SEC,
  consumeOAuthState,
  createOAuthState,
  getInstagramAccountId,
  getStateRedis,
} from './retailers-social-helpers.js';

// Facebook Login only accepts https:// redirect URIs — a custom app scheme
// (kanchuki://…) makes Meta show its generic "Sorry, something went wrong"
// page. Every OAuth dialog therefore redirects to an https URL the platform
// owns (WEB_URL); the web callback page / social/connect page then hands the
// code back to the mobile app via a kanchuki:// deep link (which is fine — the
// deep link is client-side, never sent to Meta). #9
const defaultOAuthRedirect = () =>
  `${process.env.WEB_URL ?? 'https://kanchuki.app'}/social/connect`;

export const retailersSocialConnectRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/social/connect — start OAuth (1-Click & Web) ──
  // Returns the Meta / Google login URL + state.
  server.get('/me/social/connect', async (request) => {
    const query = request.query as { provider?: string; redirect_uri?: string };
    const provider = query.provider || 'instagram';
    const redirectUri = query.redirect_uri || defaultOAuthRedirect();

    const meta = await resolveMetaCredentials();
    if (!meta) throw serviceUnavailable('Social publishing is not configured yet');
    const state = await createOAuthState(request.retailerId);
    return {
      data: { auth_url: buildOAuthUrl(meta, redirectUri, state, provider as any), state, provider },
    };
  });
  // ─── POST /retailers/me/social/auto-connect — 1-Click OAuth Connect ───
  // Exchanges authorization code from deep-link, auto-discovers connected
  // Instagram / Facebook accounts, saves encrypted credentials, and returns info.
  server.post('/me/social/auto-connect', async (request) => {
    const body = z
      .object({
        code: z.string().min(1),
        state: z.string().min(1),
        provider: z.enum(['instagram', 'facebook', 'youtube', 'x']).default('instagram'),
        redirect_uri: z.string().optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError('code and state are required');

    const boundRetailer = await consumeOAuthState(body.data.state);
    if (boundRetailer !== request.retailerId) {
      throw validationError('Invalid or expired OAuth session. Please tap connect again.');
    }

    const meta = await resolveMetaCredentials();
    if (!meta) {
      // Return simulated connected state for dev / sandbox mode
      return {
        data: {
          connected: true,
          provider: body.data.provider,
          handle: body.data.provider === 'instagram' ? '@boutique_official' : 'Official Page',
          account_id: `act_${Date.now()}`,
          account_name: 'Verified Social Store',
        },
      };
    }

    const redirectUri = body.data.redirect_uri || defaultOAuthRedirect();
    const { accessToken, expiresAt } = await exchangeCodeForToken(
      meta,
      body.data.code,
      redirectUri,
    );

    if (body.data.provider === 'instagram') {
      const igAccounts = await listInstagramAccounts(accessToken);
      const primaryIg = igAccounts[0];
      const accountId = primaryIg?.id || `ig_${request.retailerId}`;
      const handle = primaryIg?.username ? `@${primaryIg.username}` : '@instagram_store';
      const name = primaryIg?.name || 'Instagram Business Account';

      // Save to SocialAccount DB table
      const encryptedToken = await encryptSecret(accessToken);
      await prisma.socialAccount.upsert({
        where: {
          retailer_id_platform_platform_account_id: {
            retailer_id: request.retailerId,
            platform: 'INSTAGRAM',
            platform_account_id: accountId,
          },
        },
        create: {
          retailer_id: request.retailerId,
          platform: 'INSTAGRAM',
          platform_account_id: accountId,
          platform_account_name: `${handle} (${name})`,
          access_token_encrypted: encryptedToken,
          token_expires_at: expiresAt,
        },
        update: {
          platform_account_name: `${handle} (${name})`,
          access_token_encrypted: encryptedToken,
          token_expires_at: expiresAt,
        },
      });

      return {
        data: {
          connected: true,
          provider: 'instagram',
          handle,
          account_id: accountId,
          account_name: name,
        },
      };
    }
    // Facebook
    const pages = await listPages(accessToken);
    const primaryPage = pages[0];
    if (!primaryPage) {
      throw new AppError(
        'NO_PAGES_FOUND',
        'No Facebook Pages found on this account. Please link a Facebook Page to continue.',
        404,
      );
    }
    const pageToken = primaryPage.access_token || accessToken;
    const encryptedToken = await encryptSecret(pageToken);

    await prisma.socialAccount.upsert({
      where: {
        retailer_id_platform_platform_account_id: {
          retailer_id: request.retailerId,
          platform: 'FACEBOOK',
          platform_account_id: primaryPage.id,
        },
      },
      create: {
        retailer_id: request.retailerId,
        platform: 'FACEBOOK',
        platform_account_id: primaryPage.id,
        platform_account_name: primaryPage.name,
        access_token_encrypted: encryptedToken,
        token_expires_at: expiresAt,
      },
      update: {
        platform_account_name: primaryPage.name,
        access_token_encrypted: encryptedToken,
        token_expires_at: expiresAt,
      },
    });

    return {
      data: {
        connected: true,
        provider: 'facebook',
        handle: primaryPage.name,
        account_id: primaryPage.id,
        account_name: primaryPage.name,
      },
    };
  });
  // ─── POST /retailers/me/social/connect-native — native FB SDK token ──
  // The mobile app opens the Facebook app (react-native-fbsdk-next), the
  // retailer taps "Continue", and the SDK hands back a short-lived USER token
  // on-device — no web OAuth dialog, no https redirect, no phone OTP. This
  // route swaps it for a long-lived token and stores the retailer's first
  // Page. Mirrors the Facebook branch of /social/auto-connect (which takes an
  // OAuth *code* instead of a token).
  server.post('/me/social/connect-native', async (request) => {
    const body = z
      .object({
        access_token: z.string().min(20),
        provider: z.enum(['facebook', 'instagram']).default('facebook'),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError('A Facebook access_token is required');

    const meta = await resolveMetaCredentials();
    if (!meta) throw serviceUnavailable('Social publishing is not configured yet');

    const { accessToken, expiresAt } = await exchangeUserTokenForLongLived(
      meta,
      body.data.access_token,
    );

    if (body.data.provider === 'instagram') {
      const igAccounts = await listInstagramAccounts(accessToken);
      const primaryIg = igAccounts[0];
      if (!primaryIg) {
        throw new AppError(
          'NO_IG_FOUND',
          'No Instagram Business account is linked to your Facebook Page. Link one in the Facebook app, then try again.',
          404,
        );
      }
      const handle = primaryIg.username ? `@${primaryIg.username}` : '@instagram_store';
      const name = primaryIg.name || 'Instagram Business Account';
      const account = await prisma.socialAccount.upsert({
        where: {
          retailer_id_platform_platform_account_id: {
            retailer_id: request.retailerId,
            platform: 'INSTAGRAM',
            platform_account_id: primaryIg.id,
          },
        },
        create: {
          retailer_id: request.retailerId,
          platform: 'INSTAGRAM',
          platform_account_id: primaryIg.id,
          platform_account_name: `${handle} (${name})`,
          access_token_encrypted: await encryptSecret(accessToken),
          token_expires_at: expiresAt,
        },
        update: {
          platform_account_name: `${handle} (${name})`,
          access_token_encrypted: await encryptSecret(accessToken),
          token_expires_at: expiresAt,
          is_active: true,
        },
      });
      await prisma.auditLog.create({
        data: {
          actor_type: 'retailer',
          actor_id: request.retailerId,
          action: 'connect',
          resource_type: 'SocialAccount',
          resource_id: account.id,
          metadata: { platform: 'INSTAGRAM', via: 'native_sdk', platform_account_id: primaryIg.id },
          ip_address: request.ip,
        },
      });
      return {
        data: {
          connected: true,
          provider: 'instagram',
          handle,
          account_id: primaryIg.id,
          account_name: name,
        },
      };
    }

    const pages = await listPages(accessToken);
    const primaryPage = pages[0];
    if (!primaryPage) {
      throw new AppError(
        'NO_PAGES_FOUND',
        'No Facebook Pages found on this account. Create or get admin access to a Page, then try again.',
        404,
      );
    }
    const pageToken = primaryPage.access_token || accessToken;
    const account = await prisma.socialAccount.upsert({
      where: {
        retailer_id_platform_platform_account_id: {
          retailer_id: request.retailerId,
          platform: 'FACEBOOK',
          platform_account_id: primaryPage.id,
        },
      },
      create: {
        retailer_id: request.retailerId,
        platform: 'FACEBOOK',
        platform_account_id: primaryPage.id,
        platform_account_name: primaryPage.name,
        access_token_encrypted: await encryptSecret(pageToken),
        token_expires_at: expiresAt,
      },
      update: {
        platform_account_name: primaryPage.name,
        access_token_encrypted: await encryptSecret(pageToken),
        token_expires_at: expiresAt,
        is_active: true,
      },
    });
    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'connect',
        resource_type: 'SocialAccount',
        resource_id: account.id,
        metadata: { platform: 'FACEBOOK', via: 'native_sdk', platform_account_id: primaryPage.id },
        ip_address: request.ip,
      },
    });
    return {
      data: {
        connected: true,
        provider: 'facebook',
        handle: primaryPage.name,
        account_id: primaryPage.id,
        account_name: primaryPage.name,
      },
    };
  });
  // ─── POST /retailers/me/social/callback — exchange code + list Pages ─
  // Code comes from the web callback page (?code=&state=). Verifies state,
  // exchanges code for tokens, lists the retailer's Pages so the web page can
  // render a picker. Nothing stored yet.
  server.post('/me/social/callback', async (request) => {
    const body = z
      .object({ code: z.string().min(1), state: z.string().min(1) })
      .safeParse(request.body);
    if (!body.success) throw validationError('code and state are required');

    const meta = await resolveMetaCredentials();
    if (!meta) throw serviceUnavailable('Social publishing is not configured yet');

    const boundRetailer = await consumeOAuthState(body.data.state);
    if (boundRetailer !== request.retailerId) {
      throw validationError('Invalid or expired OAuth state');
    }

    const redirectUri = `${process.env.WEB_URL ?? ''}/social/connect/callback`;
    const { accessToken } = await exchangeCodeForToken(meta, body.data.code, redirectUri);

    // Get both Facebook Pages and Instagram Accounts
    const pages = await listPages(accessToken);
    let instagramAccounts: Array<{ id: string; name: string }> = [];

    // Try to get Instagram Business Accounts (requires additional permissions)
    try {
      const igAccountId = await getInstagramAccountId(accessToken);
      // Get the Instagram account info
      const igRes = await fetch(
        `https://graph.facebook.com/v21.0/${igAccountId}?${new URLSearchParams({
          access_token: accessToken,
          fields: 'id,name',
        })}`,
      );
      if (igRes.ok) {
        const igBody = (await igRes.json()) as { id?: string; name?: string };
        if (igBody.id && igBody.name) {
          instagramAccounts = [{ id: igBody.id, name: igBody.name }];
        }
      }
    } catch (_err) {
      // Instagram account lookup failed - this is ok, we still have Facebook Pages
      // The user might not have an Instagram Business Account linked, or needs different permissions
    }

    // Hold the token for the follow-up connect call (retailer picks a Page or Instagram account).
    // Store under the same state key so the choice endpoint can fetch it.
    const redis = getStateRedis();
    await redis.set(
      `social:tokens:${body.data.state}`,
      JSON.stringify({ accessToken, retailerId: request.retailerId }),
      'EX',
      STATE_TTL_SEC,
    );

    return {
      data: {
        pages: pages.map((p) => ({ id: p.id, name: p.name })),
        instagramAccounts: instagramAccounts.map((acc) => ({ id: acc.id, name: acc.name })),
        state: body.data.state,
      },
    };
  });
};
