// src/gmb-sync.ts
import Fastify from 'fastify';
import gmbRoutes from './routes/gmb';

const fastify = Fastify({
  logger: true
});

// Register routes
fastify.register(gmbRoutes, { prefix: '/gmb' });

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' });
});

const start = async () => {
  try {
    await fastify.listen({ port: 3003, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();