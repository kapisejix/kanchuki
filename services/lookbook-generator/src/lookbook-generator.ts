// src/lookbook-generator.ts
import Fastify from 'fastify';
// Assuming we can use the db package's PrismaClient
import { PrismaClient } from '@kanchuki/db';

const fastify = Fastify({
  logger: true
});

// Initialize Prisma client
const prisma = new PrismaClient();

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' });
});

// Generate lookbook for a retailer
fastify.post('/lookbook', async (request, reply) => {
  const { retailerId } = request.body as { retailerId: string };
  
  if (!retailerId) {
    return reply.status(400).send({ error: 'retailerId is required' });
  }

  try {
    // Fetch retailer and their products
    const retailer = await prisma.retailer.findUnique({
      where: { id: retailerId },
      include: {
        products: {
          include: {
            images: true,
            variants: true
          }
        }
      }
    });

    if (!retailer) {
      return reply.status(404).send({ error: 'Retailer not found' });
    }

    // Generate simple HTML lookbook
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lookbook for ${retailer.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          .product { border: 1px solid #ddd; margin: 20px 0; padding: 20px; border-radius: 8px; }
          .product img { max-width: 200px; height: auto; margin-right: 20px; }
          .product-info { display: flex; flex-wrap: wrap; align-items: center; }
          .product-details { flex: 1; }
          .price { font-weight: bold; color: #2c3e50; }
          .sku { color: #7f8c8d; font-size: 0.9em; }
        </style>
      </head>
      <body>
        <h1>Lookbook for ${retailer.name}</h1>
        <p>Generated on ${new Date().toLocaleDateString()}</p>
        ${retailer.products.map(product => `
          <div class="product">
            <div class="product-info">
              ${product.images && product.images.length > 0 ? 
                `<img src="${product.images[0].url}" alt="${product.name}">` : 
                `<div style="width:200px;height:200px;background:#eee;display:flex;align-items:center;justify-content:center;">No Image</div>`
              }
              <div class="product-details">
                <h2>${product.name}</h2>
                <div class="sku">SKU: ${product.sku}</div>
                <div class="price">$${product.price.toFixed(2)}</div>
                ${product.description ? `<p>${product.description}</p>` : ''}
              </div>
            </div>
          </div>
        `).join('')}
      </body>
      </html>
    `;

    // Set content type to HTML
    reply.type('text/html').send(html);
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

const start = async () => {
  try {
    // Use port 3005 to avoid conflict with other services
    await fastify.listen({ port: 3005, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();