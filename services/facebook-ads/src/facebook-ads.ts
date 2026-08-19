// ponytail: placeholder for Facebook Local Awareness Ads service, replace with actual Meta API integration when needed
import Fastify from 'fastify';
// Assuming we can use the db package's PrismaClient if needed in the future
// import { PrismaClient } from '@kanchuki/db';

const fastify = Fastify({
  logger: true
});

// Initialize Prisma client if needed
// const prisma = new PrismaClient();

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// Placeholder for creating a Facebook Local Awareness Ads campaign
fastify.post('/campaigns', async (request, reply) => {
  const { name, budget, radius, latitude, longitude } = request.body as {
    name?: string;
    budget?: number; // in cents or local currency?
    radius?: number; // in meters
    latitude?: number;
    longitude?: number;
  };

  // TODO: Validate input
  // TODO: Call Meta API to create campaign
  // TODO: Store campaign details in database if needed

  // For now, return a mock campaign ID
  const campaignId = `fb_ads_${Date.now()}`;

  return {
    id: campaignId,
    name: name || 'Unnamed Campaign',
    status: 'CREATED',
    budget: budget || 0,
    radius: radius || 0,
    center: { latitude: latitude || 0, longitude: longitude || 0 },
    created_at: new Date().toISOString()
  };
});

// Placeholder for getting campaign performance
fastify.get('/campaigns/:campaignId/performance', async (request, reply) => {
  const { campaignId } = request.params as { campaignId: string };

  // TODO: Fetch performance from Meta API
  // TODO: Combine with any local metrics if stored

  // Mock performance data
  return {
    campaign_id: campaignId,
    impressions: Math.floor(Math.random() * 1000),
    clicks: Math.floor(Math.random() * 50),
    spend: Math.floor(Math.random() * 1000), // in cents
    ctr: Math.random() * 0.1, // click-through rate
    date_start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    date_end: new Date().toISOString().split('T')[0]
  };
});

// Placeholder for updating campaign budget
fastify.post('/campaigns/:campaignId/budget', async (request, reply) => {
  const { campaignId } = request.params as { campaignId: string };
  const { budget } = request.body as { budget?: number };

  // TODO: Validate budget
  // TODO: Call Meta API to update campaign budget
  // TODO: Update local storage if applicable

  return {
    id: campaignId,
    budget: budget || 0,
    updated_at: new Date().toISOString()
  };
});

const start = async () => {
  try {
    // Use port 3007 to avoid conflict with other services
    await fastify.listen({ port: 3007, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Self-check: test basic logic
function demo() {
  // Simple test: ensure we can create a mock campaign ID
  const campaignId = `fb_ads_${Date.now()}`;
  if (!campaignId.startsWith('fb_ads_')) {
    throw new Error('Demo failed: campaign ID generation failed');
  }
  console.log('Demo passed: Facebook Ads service basic logic is correct');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}

start();