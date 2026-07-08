import { prisma } from '@kanchuki/db'
import { embedProduct, formatVectorLiteral } from '@kanchuki/ai'
import type { EmbeddingJobData } from './index.js'

export async function handleGenerateEmbedding(data: EmbeddingJobData): Promise<void> {
  const { product_id, retailer_id } = data

  const product = await prisma.product.findFirst({
    where: { id: product_id, retailer_id, deleted_at: null },
    select: {
      category: true,
      product_type: true,
      primary_color: true,
      secondary_colors: true,
      fabric_estimate: true,
      pattern: true,
      embellishments: true,
      occasions: true,
      search_tags: true,
      price_min: true,
      notes: true,
    },
  })

  if (!product) return // Product deleted before job ran — skip silently

  const { embedding, input_hash } = await embedProduct(product)

  // Upsert — overwrite existing embedding if tags were updated
  await prisma.$executeRaw`
    INSERT INTO product_embeddings (id, product_id, retailer_id, embedding, input_hash, model_version, created_at, updated_at)
    VALUES (
      ${`emb_${product_id}`},
      ${product_id},
      ${retailer_id},
      ${formatVectorLiteral(embedding)}::vector,
      ${input_hash},
      'text-embedding-3-small',
      NOW(),
      NOW()
    )
    ON CONFLICT (product_id) DO UPDATE SET
      embedding = EXCLUDED.embedding,
      input_hash = EXCLUDED.input_hash,
      updated_at = NOW()
  `
}
