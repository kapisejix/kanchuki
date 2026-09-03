// Meta Catalog API client (Phase II: WhatsApp Business native catalog sync).
//
// Extends the existing Meta Graph API client (meta-graph.ts) with WhatsApp
// Business Account (WABA) catalog CRUD operations.
//
// Required scopes on the WABA access token:
//   - whatsapp_business_management
//   - catalog_management
//
// Env / F-012 secrets (getSecret, DB-first with env fallback):
//   META_APP_ID                    — Meta for Developers app id
//   META_APP_SECRET                — app secret
//   META_WHATSAPP_BUSINESS_ACCOUNT_ID  — WABA ID (numeric)
//   META_WEBHOOK_SECRET            — webhook verify token
//
// Retailer's own WhatsApp access token is stored encrypted in
// Retailer.whatsapp_api_access_token (bring-your-own model, same as
// WhatsApp Business API bulk-send).

import { getSecret } from '@kanchuki/db';
import { MetaApiError } from './meta-graph.js';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';

export interface CatalogItem {
  id: string; // Meta's catalog item ID
  retailer_id: string; // Retailer's product ID (external_id)
  name: string;
  description?: string;
  price: number; // in smallest currency unit (paise)
  currency: string; // 'INR'
  availability: 'in stock' | 'out of stock' | 'available for order' | 'preorder';
  condition: 'new' | 'refurbished' | 'used';
  image_url?: string;
  image_hash?: string; // After upload to Meta
  category_id?: string; // Meta's product category taxonomy ID
  brand?: string;
  retailer_category?: string; // Retailer's custom category
  url?: string; // Product URL (can be Kanchuki collection link)
}

export interface Catalog {
  id: string;
  name: string;
  whatsapp_business_account_id: string;
}

export interface CatalogImageUploadResponse {
  image_hash: string;
}

export interface CatalogItemCreateInput {
  name: string;
  description?: string;
  price: number;
  currency: string;
  availability: 'in stock' | 'out of stock' | 'available for order' | 'preorder';
  condition?: 'new' | 'refurbished' | 'used';
  image_url?: string;
  category_id?: string;
  brand?: string;
  retailer_category?: string;
  url?: string;
}

export interface CatalogItemUpdateInput {
  name?: string;
  description?: string;
  price?: number;
  availability?: 'in stock' | 'out of stock' | 'available for order' | 'preorder';
  image_url?: string;
  category_id?: string;
  retailer_category?: string;
  url?: string;
}

/**
 * Resolve WhatsApp catalog credentials through getSecret (F-012).
 * Returns WABA ID + access token for the retailer.
 */
export async function resolveCatalogCredentials(
  retailerAccessToken: string,
): Promise<{ wabaId: string; accessToken: string } | null> {
  const wabaId = (await getSecret('META_WHATSAPP_BUSINESS_ACCOUNT_ID'))?.trim();
  if (!wabaId || !retailerAccessToken) return null;
  return { wabaId, accessToken: retailerAccessToken };
}

/**
 * Get or create the catalog for a WABA.
 * Returns existing catalog ID if one exists, otherwise creates a new one.
 */
export async function getOrCreateCatalog(
  wabaId: string,
  accessToken: string,
  catalogName = 'Kanchuki Product Catalog',
  signal?: AbortSignal,
): Promise<string> {
  // First try to list existing catalogs for this WABA
  const listRes = await fetch(
    `${GRAPH_BASE}/${wabaId}/catalogs?${new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name',
    })}`,
    { signal },
  );
  const listBody = (await listRes.json()) as { data?: Catalog[] };

  if (listRes.ok && Array.isArray(listBody.data) && listBody.data.length > 0) {
    // Return the first catalog (typically retailers only have one)
    return listBody.data[0]!.id;
  }

  // Create a new catalog
  const createRes = await fetch(`${GRAPH_BASE}/${wabaId}/catalogs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      access_token: accessToken,
      name: catalogName,
      vertical: 'ECOMMERCE',
    }),
    signal,
  });
  const createBody = (await createRes.json()) as { id?: string; error?: Record<string, unknown> };

  if (!createRes.ok || !createBody.id) {
    throw new MetaApiError('Failed to create WhatsApp catalog', 400, 'CATALOG_CREATE_FAILED');
  }

  return createBody.id;
}

/**
 * Upload an image to Meta and get back an image_hash.
 * This is required for catalog items with images.
 */
export async function uploadCatalogImage(
  imageUrl: string,
  accessToken: string,
  signal?: AbortSignal,
): Promise<string> {
  // Download the image from R2 (public URL)
  const imageRes = await fetch(imageUrl, { signal });
  if (!imageRes.ok) {
    throw new MetaApiError('Failed to fetch image from R2', 400, 'IMAGE_FETCH_FAILED');
  }
  const imageBuffer = await imageRes.arrayBuffer();

  // Upload to Meta's media endpoint
  const formData = new FormData();
  formData.append('file', new Blob([imageBuffer]), 'product.jpg');

  const uploadRes = await fetch(
    `${GRAPH_BASE}/me/media?${new URLSearchParams({ access_token: accessToken })}`,
    {
      method: 'POST',
      body: formData,
      signal,
    },
  );
  const uploadBody = (await uploadRes.json()) as CatalogImageUploadResponse & {
    error?: Record<string, unknown>;
  };

  if (!uploadRes.ok || !uploadBody.image_hash) {
    throw new MetaApiError('Failed to upload image to Meta', 400, 'IMAGE_UPLOAD_FAILED');
  }

  return uploadBody.image_hash;
}

/**
 * Create a catalog item in the WhatsApp Business catalog.
 */
export async function createCatalogItem(
  catalogId: string,
  accessToken: string,
  item: CatalogItemCreateInput,
  retailerId: string,
  signal?: AbortSignal,
): Promise<{ id: string }> {
  // Build the item payload
  const payload: Record<string, unknown> = {
    access_token: accessToken,
    name: item.name,
    price: item.price,
    currency: item.currency,
    availability: item.availability,
    condition: item.condition ?? 'new',
    retailer_id: retailerId, // External ID for idempotency
  };

  if (item.description) payload.description = item.description;
  if (item.category_id) payload.category_id = item.category_id;
  if (item.brand) payload.brand = item.brand;
  if (item.retailer_category) payload.retailer_category = item.retailer_category;
  if (item.url) payload.url = item.url;

  // Handle image: if image_url provided, upload first
  if (item.image_url) {
    try {
      const imageHash = await uploadCatalogImage(item.image_url, accessToken, signal);
      payload.image_hash = imageHash;
    } catch (err) {
      // Log warning but continue without image
      console.warn(`Failed to upload image for catalog item ${retailerId}:`, err);
    }
  }

  const res = await fetch(`${GRAPH_BASE}/${catalogId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const body = (await res.json()) as { id?: string; error?: Record<string, unknown> };

  if (!res.ok || !body.id) {
    throw new MetaApiError(
      'Meta rejected the catalog item creation',
      400,
      'CATALOG_ITEM_CREATE_FAILED',
    );
  }

  return { id: body.id };
}

/**
 * Update a catalog item in the WhatsApp Business catalog.
 */
export async function updateCatalogItem(
  _catalogId: string,
  accessToken: string,
  itemId: string,
  updates: CatalogItemUpdateInput,
  signal?: AbortSignal,
): Promise<void> {
  const payload: Record<string, unknown> = { access_token: accessToken };

  if (updates.name) payload.name = updates.name;
  if (updates.description) payload.description = updates.description;
  if (updates.price !== undefined) payload.price = updates.price;
  if (updates.availability) payload.availability = updates.availability;
  if (updates.category_id) payload.category_id = updates.category_id;
  if (updates.retailer_category) payload.retailer_category = updates.retailer_category;
  if (updates.url) payload.url = updates.url;

  // Handle image update
  if (updates.image_url) {
    try {
      const imageHash = await uploadCatalogImage(updates.image_url, accessToken, signal);
      payload.image_hash = imageHash;
    } catch (err) {
      console.warn(`Failed to upload image for catalog item update ${itemId}:`, err);
    }
  }

  const res = await fetch(`${GRAPH_BASE}/${itemId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  const body = (await res.json()) as { success?: boolean; error?: Record<string, unknown> };

  if (!res.ok || body.success !== true) {
    throw new MetaApiError(
      'Meta rejected the catalog item update',
      400,
      'CATALOG_ITEM_UPDATE_FAILED',
    );
  }
}

/**
 * Delete a catalog item from the WhatsApp Business catalog.
 */
export async function deleteCatalogItem(
  _catalogId: string,
  accessToken: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(
    `${GRAPH_BASE}/${itemId}?${new URLSearchParams({ access_token: accessToken })}`,
    { method: 'DELETE', signal },
  );
  const body = (await res.json()) as { success?: boolean; error?: Record<string, unknown> };

  if (!res.ok || body.success !== true) {
    throw new MetaApiError(
      'Meta rejected the catalog item deletion',
      400,
      'CATALOG_ITEM_DELETE_FAILED',
    );
  }
}

/**
 * List all items in a catalog.
 * Supports pagination via after/before cursors.
 */
export async function listCatalogItems(
  catalogId: string,
  accessToken: string,
  limit = 100,
  after?: string,
  signal?: AbortSignal,
): Promise<{ items: CatalogItem[]; nextCursor?: string }> {
  const params = new URLSearchParams({
    access_token: accessToken,
    limit: String(limit),
    fields:
      'id,retailer_id,name,description,price,currency,availability,condition,image_url,category_id,brand,retailer_category,url',
  });
  if (after) params.set('after', after);

  const res = await fetch(`${GRAPH_BASE}/${catalogId}/items?${params}`, { signal });
  const body = (await res.json()) as {
    data?: CatalogItem[];
    paging?: { cursors?: { after: string } };
  };

  if (!res.ok || !Array.isArray(body.data)) {
    throw new MetaApiError('Failed to list catalog items', 400, 'CATALOG_LIST_FAILED');
  }

  return {
    items: body.data,
    nextCursor: body.paging?.cursors?.after,
  };
}

/**
 * Batch create/update multiple catalog items.
 * Meta supports batch operations via the /batch endpoint.
 * Returns results for each operation.
 */
export async function batchCatalogItems(
  catalogId: string,
  accessToken: string,
  operations: Array<{
    method: 'POST' | 'DELETE';
    retailer_id: string;
    item?: CatalogItemCreateInput;
  }>,
  signal?: AbortSignal,
): Promise<Array<{ retailer_id: string; id?: string; success: boolean; error?: string }>> {
  // Meta's batch API format
  const batch = operations.map((op, index) => ({
    method: op.method,
    relative_url:
      op.method === 'POST' ? `${catalogId}/items` : `${catalogId}/items/${op.retailer_id}`,
    body:
      op.method === 'POST'
        ? JSON.stringify({
            ...op.item,
            retailer_id: op.retailer_id,
            access_token: accessToken,
          })
        : undefined,
    name: `req${index}`,
  }));

  const res = await fetch(
    `${GRAPH_BASE}?${new URLSearchParams({
      access_token: accessToken,
      batch: JSON.stringify(batch),
      include_headers: 'false',
    })}`,
    { method: 'POST', signal },
  );
  const body = (await res.json()) as Array<{ code: number; body: Record<string, unknown> }>;

  if (!res.ok) {
    throw new MetaApiError('Batch catalog operation failed', 400, 'BATCH_FAILED');
  }

  return body.map((result, index) => {
    const op = operations[index]!;
    return {
      retailer_id: op.retailer_id,
      id: (result.body as { id?: string })?.id,
      success: result.code === 200,
      error:
        result.code !== 200
          ? (result.body as { error?: { message?: string } })?.error?.message
          : undefined,
    };
  });
}

/**
 * Check if a catalog item exists by retailer_id (external ID).
 */
export async function getCatalogItemByRetailerId(
  catalogId: string,
  accessToken: string,
  retailerId: string,
  signal?: AbortSignal,
): Promise<CatalogItem | null> {
  // Filter by retailer_id (external_id)
  const params = new URLSearchParams({
    access_token: accessToken,
    fields:
      'id,retailer_id,name,description,price,currency,availability,condition,image_url,category_id,brand,retailer_category,url',
    filter: JSON.stringify({ retailer_id: { eq: retailerId } }),
  });

  const res = await fetch(`${GRAPH_BASE}/${catalogId}/items?${params}`, { signal });
  const body = (await res.json()) as { data?: CatalogItem[] };

  if (!res.ok || !Array.isArray(body.data) || body.data.length === 0) {
    return null;
  }

  return body.data[0]!;
}
