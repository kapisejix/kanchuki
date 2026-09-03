// Retailer-facing integrations management.
//
// Retailers configure their own Google Business Profile, Facebook Ads,
// and Google Ads credentials. Credentials are stored encrypted at rest.
// Routes handle save, retrieve, test connection, and disconnect.

import { decryptSecret, encryptSecret, prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound, validationError } from '../../plugins/error-handler.js';

// ─── Zod Schemas ──────────────────────────────────────────────────

const GmbConfigSchema = z.object({
  account_id: z.string().min(1),
  location_id: z.string().min(1),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
});

const FbAdsConfigSchema = z.object({
  access_token: z.string().min(1),
  ad_account_id: z.string().min(1),
  page_id: z.string().min(1),
});

const GoogleAdsConfigSchema = z.object({
  refresh_token: z.string().min(1),
  customer_id: z.string().min(1),
  developer_token: z.string().min(1),
});

// ─── Route ─────────────────────────────────────────────────────────

export const retailersIntegrationsRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /retailers/me/integrations ─────────────────────────────
  // List all configured integrations for this retailer (masked).
  server.get('/me/integrations', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        gmb_account_id: true,
        gmb_location_id: true,
        gmb_configured_at: true,
        fb_ads_ad_account_id: true,
        fb_ads_page_id: true,
        fb_ads_configured_at: true,
        google_ads_customer_id: true,
        google_ads_configured_at: true,
      },
    });
    if (!retailer) throw notFound('Retailer');

    return {
      data: {
        gmb: {
          configured: !!retailer.gmb_account_id,
          account_id: retailer.gmb_account_id,
          location_id: retailer.gmb_location_id,
          configured_at: retailer.gmb_configured_at,
        },
        facebook_ads: {
          configured: !!retailer.fb_ads_ad_account_id,
          ad_account_id: retailer.fb_ads_ad_account_id,
          page_id: retailer.fb_ads_page_id,
          configured_at: retailer.fb_ads_configured_at,
        },
        google_ads: {
          configured: !!retailer.google_ads_customer_id,
          customer_id: retailer.google_ads_customer_id,
          configured_at: retailer.google_ads_configured_at,
        },
      },
    };
  });

  // ─── POST /retailers/me/integrations/gmb ────────────────────────
  // Save Google Business Profile credentials.
  server.post('/me/integrations/gmb', async (request) => {
    const body = GmbConfigSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        gmb_account_id: body.data.account_id,
        gmb_location_id: body.data.location_id,
        gmb_access_token: encryptSecret(body.data.access_token),
        gmb_refresh_token: body.data.refresh_token ? encryptSecret(body.data.refresh_token) : null,
        gmb_configured_at: new Date(),
      },
      select: { gmb_account_id: true, gmb_location_id: true, gmb_configured_at: true },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'configure',
        resource_type: 'Integration',
        resource_id: 'gmb',
        metadata: { account_id: body.data.account_id, location_id: body.data.location_id },
        ip_address: request.ip,
      },
    });

    return { data: { configured: true, ...updated } };
  });

  // ─── DELETE /retailers/me/integrations/gmb ──────────────────────
  server.delete('/me/integrations/gmb', async (request, reply) => {
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        gmb_account_id: null,
        gmb_location_id: null,
        gmb_access_token: null,
        gmb_refresh_token: null,
        gmb_token_expiry: null,
        gmb_configured_at: null,
      },
    });
    return reply.status(204).send();
  });

  // ─── POST /retailers/me/integrations/gmb/test ───────────────────
  // Test GMB connection by listing the location's posts.
  server.post('/me/integrations/gmb/test', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { gmb_access_token: true, gmb_location_id: true },
    });
    if (!retailer?.gmb_access_token || !retailer.gmb_location_id) {
      throw validationError('GMB is not configured');
    }

    const token = decryptSecret(retailer.gmb_access_token);
    const res = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${retailer.gmb_location_id}/localPosts?pageSize=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        data: { connected: false, error: (err as any).error?.message ?? 'API request failed' },
      };
    }

    return { data: { connected: true } };
  });

  // ─── POST /retailers/me/integrations/gmb/post ───────────────────
  // Post to Google Business Profile (new arrival, offer, etc.)
  server.post('/me/integrations/gmb/post', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { gmb_access_token: true, gmb_location_id: true, gmb_refresh_token: true },
    });
    if (!retailer?.gmb_access_token || !retailer.gmb_location_id) {
      throw validationError('GMB is not configured');
    }

    const body = z
      .object({
        summary: z.string().min(1).max(1000),
        call_to_action: z.enum(['LEARN_MORE', 'ORDER', 'BOOK', 'SHOP', 'SIGN_UP']).optional(),
        url: z.string().url().optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const token = decryptSecret(retailer.gmb_access_token);

    const postBody: Record<string, unknown> = {
      languageCode: 'en-IN',
      summary: body.data.summary,
      topicType: 'STANDARD',
    };
    if (body.data.call_to_action && body.data.url) {
      postBody.callToAction = {
        actionType: body.data.call_to_action,
        url: body.data.url,
      };
    }

    const res = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${retailer.gmb_location_id}/localPosts`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(postBody),
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw validationError((err as any).error?.message ?? 'Failed to post to GMB');
    }

    const result = await res.json();
    return { data: { post_id: (result as any).name, status: 'posted' } };
  });

  // ─── POST /retailers/me/integrations/fb-ads ─────────────────────
  // Save Facebook Ads credentials.
  server.post('/me/integrations/fb-ads', async (request) => {
    const body = FbAdsConfigSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        fb_ads_access_token: encryptSecret(body.data.access_token),
        fb_ads_ad_account_id: body.data.ad_account_id,
        fb_ads_page_id: body.data.page_id,
        fb_ads_configured_at: new Date(),
      },
      select: { fb_ads_ad_account_id: true, fb_ads_page_id: true, fb_ads_configured_at: true },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'configure',
        resource_type: 'Integration',
        resource_id: 'fb_ads',
        metadata: { ad_account_id: body.data.ad_account_id, page_id: body.data.page_id },
        ip_address: request.ip,
      },
    });

    return { data: { configured: true, ...updated } };
  });

  // ─── DELETE /retailers/me/integrations/fb-ads ───────────────────
  server.delete('/me/integrations/fb-ads', async (request, reply) => {
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        fb_ads_access_token: null,
        fb_ads_ad_account_id: null,
        fb_ads_page_id: null,
        fb_ads_configured_at: null,
      },
    });
    return reply.status(204).send();
  });

  // ─── POST /retailers/me/integrations/fb-ads/test ────────────────
  // Test Facebook Ads connection by fetching the ad account.
  server.post('/me/integrations/fb-ads/test', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { fb_ads_access_token: true, fb_ads_ad_account_id: true },
    });
    if (!retailer?.fb_ads_access_token || !retailer.fb_ads_ad_account_id) {
      throw validationError('Facebook Ads is not configured');
    }

    const token = decryptSecret(retailer.fb_ads_access_token);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${retailer.fb_ads_ad_account_id}?fields=name,account_status,currency`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        data: { connected: false, error: (err as any).error?.message ?? 'API request failed' },
      };
    }

    const account = await res.json();
    return {
      data: {
        connected: true,
        account_name: (account as any).name,
        account_status: (account as any).account_status,
        currency: (account as any).currency,
      },
    };
  });

  // ─── POST /retailers/me/integrations/fb-ads/create-campaign ─────
  // Create a Facebook Local Awareness Ad campaign.
  server.post('/me/integrations/fb-ads/create-campaign', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: { fb_ads_access_token: true, fb_ads_ad_account_id: true, fb_ads_page_id: true },
    });
    if (!retailer?.fb_ads_access_token || !retailer.fb_ads_ad_account_id) {
      throw validationError('Facebook Ads is not configured');
    }

    const body = z
      .object({
        name: z.string().min(1).max(100),
        daily_budget: z.number().int().min(100), // in paise/cents
        ad_text: z.string().min(1).max(500),
        image_url: z.string().url().optional(),
        link_url: z.string().url().optional(),
        target_radius_km: z.number().min(1).max(50).default(10),
        target_cities: z.array(z.string()).optional(),
      })
      .safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const token = decryptSecret(retailer.fb_ads_access_token);
    const actId = retailer.fb_ads_ad_account_id;

    // Step 1: Create campaign
    const campaignRes = await fetch(`https://graph.facebook.com/v21.0/${actId}/campaigns`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: body.data.name,
        objective: 'REACH',
        status: 'PAUSED',
        special_ad_categories: [],
      }),
    });
    if (!campaignRes.ok) {
      const err = await campaignRes.json().catch(() => ({}));
      throw validationError((err as any).error?.message ?? 'Failed to create campaign');
    }
    const campaign = await campaignRes.json();

    // Step 2: Create ad set (local awareness with radius targeting)
    const adSetRes = await fetch(`https://graph.facebook.com/v21.0/${actId}/adsets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${body.data.name} - Ad Set`,
        campaign_id: (campaign as any).id,
        daily_budget: String(body.data.daily_budget),
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'REACH',
        targeting: {
          geo_locations: {
            custom_locations: [
              {
                latitude: 28.6139, // Default Delhi — would use retailer's lat/lng
                longitude: 77.209,
                radius: body.data.target_radius_km,
                distance_unit: 'kilometer',
              },
            ],
          },
        },
        status: 'PAUSED',
      }),
    });
    if (!adSetRes.ok) {
      const err = await adSetRes.json().catch(() => ({}));
      throw validationError((err as any).error?.message ?? 'Failed to create ad set');
    }
    const adSet = await adSetRes.json();

    // Step 3: Create ad creative
    const creativeRes = await fetch(`https://graph.facebook.com/v21.0/${actId}/adcreatives`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `${body.data.name} - Creative`,
        object_story_spec: {
          page_id: retailer.fb_ads_page_id,
          link_data: {
            message: body.data.ad_text,
            link: body.data.link_url ?? 'https://kanchuki.app',
            image_url: body.data.image_url,
          },
        },
      }),
    });
    if (!creativeRes.ok) {
      const err = await creativeRes.json().catch(() => ({}));
      throw validationError((err as any).error?.message ?? 'Failed to create ad creative');
    }
    const creative = await creativeRes.json();

    // Step 4: Create ad
    const adRes = await fetch(`https://graph.facebook.com/v21.0/${actId}/ads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: body.data.name,
        adset_id: (adSet as any).id,
        creative: { creative_id: (creative as any).id },
        status: 'PAUSED',
      }),
    });
    if (!adRes.ok) {
      const err = await adRes.json().catch(() => ({}));
      throw validationError((err as any).error?.message ?? 'Failed to create ad');
    }
    const ad = await adRes.json();

    return {
      data: {
        campaign_id: (campaign as any).id,
        adset_id: (adSet as any).id,
        ad_id: (ad as any).id,
        status: 'paused',
        message: 'Campaign created (paused). Review and activate in Meta Ads Manager.',
      },
    };
  });

  // ─── POST /retailers/me/integrations/google-ads ─────────────────
  // Save Google Ads credentials.
  server.post('/me/integrations/google-ads', async (request) => {
    const body = GoogleAdsConfigSchema.safeParse(request.body);
    if (!body.success) throw validationError(body.error.issues[0]?.message ?? 'Invalid');

    const updated = await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        google_ads_refresh_token: encryptSecret(body.data.refresh_token),
        google_ads_customer_id: body.data.customer_id,
        google_ads_developer_token: encryptSecret(body.data.developer_token),
        google_ads_configured_at: new Date(),
      },
      select: { google_ads_customer_id: true, google_ads_configured_at: true },
    });

    await prisma.auditLog.create({
      data: {
        actor_type: 'retailer',
        actor_id: request.retailerId,
        action: 'configure',
        resource_type: 'Integration',
        resource_id: 'google_ads',
        metadata: { customer_id: body.data.customer_id },
        ip_address: request.ip,
      },
    });

    return { data: { configured: true, ...updated } };
  });

  // ─── DELETE /retailers/me/integrations/google-ads ───────────────
  server.delete('/me/integrations/google-ads', async (request, reply) => {
    await prisma.retailer.update({
      where: { id: request.retailerId },
      data: {
        google_ads_refresh_token: null,
        google_ads_customer_id: null,
        google_ads_developer_token: null,
        google_ads_configured_at: null,
      },
    });
    return reply.status(204).send();
  });

  // ─── POST /retailers/me/integrations/google-ads/test ────────────
  // Test Google Ads connection by listing accessible customers.
  server.post('/me/integrations/google-ads/test', async (request) => {
    const retailer = await prisma.retailer.findUnique({
      where: { id: request.retailerId },
      select: {
        google_ads_refresh_token: true,
        google_ads_customer_id: true,
        google_ads_developer_token: true,
      },
    });
    if (!retailer?.google_ads_refresh_token || !retailer.google_ads_customer_id) {
      throw validationError('Google Ads is not configured');
    }

    const refreshToken = decryptSecret(retailer.google_ads_refresh_token);
    const devToken = retailer.google_ads_developer_token
      ? decryptSecret(retailer.google_ads_developer_token)
      : '';

    // Get access token from refresh token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_ADS_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET ?? '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (!tokenRes.ok) {
      return { data: { connected: false, error: 'Failed to refresh Google Ads token' } };
    }
    const tokenData = await tokenRes.json();
    const accessToken = (tokenData as any).access_token;

    // Test by listing the customer
    const res = await fetch(
      `https://googleads.googleapis.com/v17/customers/${retailer.google_ads_customer_id}/customerClient`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': devToken,
          'login-customer-id': retailer.google_ads_customer_id.replace(/-/g, ''),
        },
      },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        data: { connected: false, error: (err as any).error?.message ?? 'API request failed' },
      };
    }

    return { data: { connected: true } };
  });
};
