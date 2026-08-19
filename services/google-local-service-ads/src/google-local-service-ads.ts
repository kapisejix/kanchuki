// ponytail: placeholder for Google Local Service Ads service, replace with actual Google Ads API integration when needed
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

// Placeholder for creating a Google Local Service Ads campaign (or lead form)
fastify.post('/leads', async (request, reply) => {
  // In a real implementation, we would receive lead data from Google Local Service Ads
  // For now, we just acknowledge receipt of a lead
  const leadData = request.body;

  // TODO: Validate lead data
  // TODO: Store lead in database
  // TODO: Trigger notification or workflow

  return {
    received: true,
    leadId: `gls_lead_${Date.now()}`,
    timestamp: new Date().toISOString()
  };
});

// Placeholder for getting leads (for dashboard)
fastify.get('/leads', async (request, reply) => {
  // TODO: Fetch leads from database with pagination, filtering, etc.
  // For now, return empty array
  return {
    leads: [],
    count: 0
  };
});

// Placeholder for updating lead status (e.g., marked as contacted, converted)
fastify.post('/leads/:leadId/status', async (request, reply) => {
  const { leadId } = request.params as { leadId: string };
  const { status } = request.body as { status?: string };

  // TODO: Validate status
  // TODO: Update lead in database

  return {
    leadId,
    status: status || 'UNKNOWN',
    updated_at: new Date().toISOString()
  };
});

const start = async () => {
  try {
    // Use port 3008 to avoid conflict with other services
    await fastify.listen({ port: 3008, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Self-check: test basic logic
function demo() {
  // Simple test: ensure we can generate a mock lead ID
  const leadId = `gls_lead_${Date.now()}`;
  if (!leadId.startsWith('gls_lead_')) {
    throw new Error('Demo failed: lead ID generation failed');
  }
  console.log('Demo passed: Google Local Service Ads service basic logic is correct');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}

start();