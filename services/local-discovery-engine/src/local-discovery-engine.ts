// src/local-discovery-engine.ts
import Fastify from 'fastify';
import nearMeRoutes from './routes/near-me';

const fastify = Fastify({
  logger: true
});

// Register routes
fastify.register(nearMeRoutes, { prefix: '/near-me' });

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' });
});

const start = async () => {
  try {
    await fastify.listen({ port: 3002, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();