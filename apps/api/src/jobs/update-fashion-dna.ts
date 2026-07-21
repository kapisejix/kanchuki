import { MIN_INTERACTIONS_FOR_DNA, computeFashionDNA, formatPreferenceVector } from '@kanchuki/ai';
import { prisma } from '@kanchuki/db';

export interface FashionDNAJobData {
  customer_id: string;
  retailer_id: string;
}

/**
 * BullMQ job handler: compute and store a customer's Fashion DNA.
 *
 * 1. Queries the customer's interactions (up to 180 days back)
 * 2. Builds weighted tag frequencies and preference text
 * 3. Generates an embedding via OpenAI
 * 4. Upserts the CustomerFashionDNA record
 *
 * If the customer has fewer than MIN_INTERACTIONS_FOR_DNA interactions,
 * the job succeeds silently (no DNA to compute yet — nothing wrong).
 */
export async function handleUpdateFashionDNA(data: FashionDNAJobData): Promise<void> {
  const { customer_id, retailer_id } = data;

  // Fetch customer with explicit preferences
  const customer = await prisma.customer.findFirst({
    where: { id: customer_id, retailer_id, deleted_at: null },
    select: {
      id: true,
      pref_colors: true,
      pref_styles: true,
      pref_fabrics: true,
      pref_occasions: true,
      budget_min: true,
      budget_max: true,
      notes: true,
    },
  });

  if (!customer) return; // Customer deleted — skip silently

  // Fetch interactions with product details (last 180 days, most recent 200)
  const cutoffDate = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const interactions = await prisma.customerInteraction.findMany({
    where: {
      customer_id,
      retailer_id,
      created_at: { gte: cutoffDate },
    },
    orderBy: { created_at: 'desc' },
    take: 200,
    include: {
      product: {
        select: {
          id: true,
          category: true,
          primary_color: true,
          fabric_estimate: true,
          pattern: true,
          embellishments: true,
          occasions: true,
          search_tags: true,
          price_min: true,
        },
      },
    },
  });

  if (interactions.length < MIN_INTERACTIONS_FOR_DNA) {
    // Not enough signal yet — if a stale DNA row exists, leave it intact
    // (better than overwriting with nothing). Just update interaction_count
    // so the retailer sees progress.
    await prisma.customerFashionDNA.upsert({
      where: { customer_id },
      create: {
        customer_id,
        retailer_id,
        interaction_count: interactions.length,
        confidence_score: 0,
      },
      update: {
        interaction_count: interactions.length,
      },
    });
    return;
  }

  // Compute the DNA
  const dna = await computeFashionDNA(
    interactions.map((i) => ({
      type: i.type,
      product: i.product
        ? {
            id: i.product.id,
            search_tags: i.product.search_tags,
            category: i.product.category,
            primary_color: i.product.primary_color,
            fabric_estimate: i.product.fabric_estimate,
            pattern: i.product.pattern,
            embellishments: i.product.embellishments,
            occasions: i.product.occasions,
            price_min: i.product.price_min,
          }
        : null,
      created_at: i.created_at,
    })),
    {
      id: customer.id,
      pref_colors: customer.pref_colors,
      pref_styles: customer.pref_styles,
      pref_fabrics: customer.pref_fabrics,
      pref_occasions: customer.pref_occasions,
      budget_min: customer.budget_min,
      budget_max: customer.budget_max,
      notes: customer.notes,
    },
  );

  if (!dna) return; // Shouldn't happen since we checked count, but guard

  // Upsert the DNA record — use raw SQL for the vector column
  await prisma.$executeRaw`
    INSERT INTO customer_fashion_dna (
      id, customer_id, retailer_id,
      preference_vector,
      color_affinities, style_affinities, fabric_affinities, occasion_affinities,
      budget_range,
      interaction_count, confidence_score,
      last_updated_at, created_at
    ) VALUES (
      ${`dna_${customer_id}`},
      ${customer_id},
      ${retailer_id},
      ${formatPreferenceVector(dna.preference_vector)}::vector,
      ${JSON.stringify(dna.color_affinities)}::jsonb,
      ${JSON.stringify(dna.style_affinities)}::jsonb,
      ${JSON.stringify(dna.fabric_affinities)}::jsonb,
      ${JSON.stringify(dna.occasion_affinities)}::jsonb,
      ${JSON.stringify(dna.budget_range)}::jsonb,
      ${dna.interaction_count},
      ${dna.confidence_score},
      NOW(),
      NOW()
    )
    ON CONFLICT (customer_id) DO UPDATE SET
      preference_vector = EXCLUDED.preference_vector,
      color_affinities = EXCLUDED.color_affinities,
      style_affinities = EXCLUDED.style_affinities,
      fabric_affinities = EXCLUDED.fabric_affinities,
      occasion_affinities = EXCLUDED.occasion_affinities,
      budget_range = EXCLUDED.budget_range,
      interaction_count = EXCLUDED.interaction_count,
      confidence_score = EXCLUDED.confidence_score,
      last_updated_at = NOW()
  `;
}
