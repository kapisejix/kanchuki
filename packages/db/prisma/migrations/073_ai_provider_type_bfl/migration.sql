-- Add BFL (Black Forest Labs) provider type for studio-shoot credit tracking.
-- AiUsageLog rows will use this provider_type to attribute FLUX Kontext
-- generations per retailer on the Admin → AI Usage dashboard.

ALTER TYPE "AiProviderType" ADD VALUE 'BFL';
