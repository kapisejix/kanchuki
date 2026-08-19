// src/incentive-engine.ts
import Fastify from 'fastify';
import visitsRoutes from './routes/visits';
import incentiveRulesRoutes from './routes/incentive-rules';

const fastify = Fastify({
  logger: true
});

// Register routes
fastify.register(visitsRoutes, { prefix: '/visits' });
fastify.register(incentiveRulesRoutes, { prefix: '/incentive-rules' });

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' });
});

const start = async () => {
  try {
    await fastify.listen({ port: 3001, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();