// src/social-template.ts
import Fastify from 'fastify';
import { generateStudioImage, downloadCompressAndUpload } from '@kanchuki/api/lib/studio-shoot';
import { runVisionAsk, type VisionAskRequest } from '@kanchuki/ai';
import { getStudioTemplate, StudioTemplateId } from '@kanchuki/shared';
import { prisma } from '@kanchuki/db';
import { publicUrl, uploadBuffer } from '@kanchuki/ai';
import { compressImageToTarget, readCappedBuffer, ssrfSafeFetch } from '@kanchuki/ai';

const fastify = Fastify({
  logger: true
});

// Register a simple health check
fastify.get('/health', async () => {
  return { status: 'ok' });
});

// Generate a social media template for a product image
fastify.post('/generate', async (request, reply) => {
  try {
    const { productId, productImageUrl, templateId, occasion, platform } = request.body as {
      productId: string;
      productImageUrl: string;
      templateId?: StudioTemplateId;
      occasion?: string;
      platform?: 'instagram' | 'whatsapp' | 'facebook';
    };

    if (!productId || !productImageUrl) {
      return reply.status(400).send({ error: 'productId and productImageUrl are required' });
    }

    // Default to a festive template if occasion is provided, otherwise use white studio
    const selectedTemplateId = templateId || 
      (occasion && occasion.toLowerCase().includes('diwali') ? 'gold_festive' : 
       occasion && (occasion.toLowerCase().includes('wedding') || occasion.toLowerCase().includes('shaadi')) ? 'gold_festive' :
       'white_studio');

    // Generate studio image with background replacement
    const studioResult = await generateStudioImage(selectedTemplateId as StudioTemplateId, productImageUrl);
    
    if (studioResult.status !== 'ready' || !studioResult.sampleUrl) {
      return reply.status(500).send({ 
        error: 'Failed to generate studio image', 
        details: studioResult.error 
      });
    }

    // Download, compress, and upload the result to R2 for permanent storage
    const timestamp = Date.now();
    const r2Key = `social-templates/${timestamp}-${selectedTemplateId}.jpg`;
    const r2Result = await downloadCompressAndUpload(studioResult.sampleUrl, r2Key);
    
    // Get the product to verify and get retailer_id
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { retailer_id: true },
    });

    if (!product) {
      return reply.status(404).send({ error: 'Product not found' });
    }

    // Create a new ProductPhoto for the template image
    const newPhoto = await prisma.productPhoto.create({
      data: {
        product_id: productId,
        retailer_id: product.retailer_id,
        r2_key: r2Result.key,
        url: r2Result.url,
        is_primary: false, // will set to true after unsetting current primary
        width: r2Result.width,
        height: r2Result.height,
        metadata: {
          social_template: {
            occasion: occasion ?? undefined,
            platform: platform ?? undefined,
            generated_at: new Date().toISOString(),
          },
        },
      },
    });

    // Unset the current primary photo and set the new one as primary
    await prisma.productPhoto.updateMany({
      where: { product_id: productId, is_primary: true },
      data: { is_primary: false },
    });

    await prisma.productPhoto.update({
      where: { id: newPhoto.id },
      data: { is_primary: true },
    });

    // Generate AI-powered text suggestion for the social media post
    const textSuggestion = await generateSocialTextSuggestion(occasion, platform);
    
    // Return the template information
    return reply.send({
      templateId: selectedTemplateId,
      occasion,
      platform,
      imageUrl: publicUrl(r2Result.key),
      textSuggestion,
      productPhotoId: newPhoto.id,
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: 'Internal server error' });
  }
});

// Helper function to generate text suggestions using AI
async function generateSocialTextSuggestion(occasion: string | undefined, platform: string | undefined): Promise<string> {
  // Default occasion and platform if not provided
  const occ = occasion || 'general';
  const plat = platform || 'instagram';
  
  // Create a prompt for the AI to generate social media text
  const prompt = `Generate a short, engaging social media caption for an Indian clothing store's ${plat} post about a ${occ} collection. Keep it warm, festive, and under 200 characters. Use appropriate emojis for the occasion.`;
  
  try {
    const req: VisionAskRequest = {
      images: [], // No images needed for text generation
      systemPrompt: `You are a social media copywriter for an Indian fashion retailer. Generate engaging, culturally appropriate captions.`,
      userPrompt: prompt,
      maxTokens: 100,
      resourceType: 'AI_TAGGING_CALL',
    };

    const raw = await runVisionAsk(req);
    const cleaned = raw.trim();
    
    // Try to parse as JSON, fallback to raw text
    try {
      const parsed = JSON.parse(cleaned);
      return parsed.caption || cleaned;
    } catch {
      return cleaned.slice(0, 200); // Limit length
    }
  } catch (error) {
    // Fallback suggestions if AI fails
    const fallbackSuggestions: Record<string, string> = {
      'diwali': '✨ Celebrate Diwali in style! New festive collection now available. Shop now & shine bright this festival of lights! 🪔💫',
      'wedding': '💍 Wedding season is here! Find your perfect outfit for the big day. Exclusive bridal & guest wear collection. 👰🤵',
      'general': '👗 New arrivals just dropped! Fresh styles for every occasion. Check out our latest collection now!'
    };
    
    const key = Object.keys(fallbackSuggestions).find(k => occ.toLowerCase().includes(k)) || 'general';
    return fallbackSuggestions[key];
  }
}

const start = async () => {
  try {
    await fastify.listen({ port: 3004, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();