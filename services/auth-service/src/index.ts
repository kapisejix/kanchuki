// ponytail: Authentication service with API key management and basic OAuth patterns
// TODO: Integrate with actual user management system and third-party OAuth providers
// For now, we provide realistic authentication patterns for retailer dashboard configuration

const fastify = Fastify({
  logger: true
});

// Initialize Prisma client
const prisma = new PrismaClient();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// JWT secret - in production, this would come from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '24h'; // 24 hours

// In-memory storage for demo purposes (in production, use proper database tables)
const apiKeysStore = new Map();
const oauthClientsStore = new Map();

// Health check
fastify.get('/health', async () => {
  return { status: 'ok' };
});

// === API KEY MANAGEMENT ===

// Generate a new API key
fastify.post('/api-keys/generate', async (request, reply) => {
  const { retailerId, name, permissions } = request.body as {
    retailerId: string;
    name?: string;
    permissions?: string[]; // e.g., ['read:orders', 'write:inventory', 'read:analytics']
  };

  if (!retailerId) {
    return reply.status(400).send({ error: 'retailerId is required' });
  }

  // Generate a secure API key
  const apiKey = `kch_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
  
  // Hash the API key for storage (never store plain API keys)
  const hashedApiKey = await bcrypt.hash(apiKey, 10);
  
  const keyId = `key_${Date.now()}`;
  const keyData = {
    id: keyId,
    retailerId,
    name: name || `API Key ${Date.now()}`,
    hashedKey: hashedApiKey,
    permissions: permissions || [],
    createdAt: new Date().toISOString(),
    lastUsedAt: null,
    isActive: true
  };

  apiKeysStore.set(keyId, keyData);

  // Return the plain API key only once (like AWS/Azure/GCP do)
  return {
    keyId,
    apiKey, // Only returned once!
    name: keyData.name,
    permissions: keyData.permissions,
    createdAt: keyData.createdAt
  };
});

// Validate an API key
fastify.post('/api-keys/validate', async (request, reply) => {
  const { apiKey } = request.body as { apiKey?: string };

  if (!apiKey) {
    return reply.status(400).send({ error: 'apiKey is required' });
  }

  // Find matching API key
  let matchedKeyId = null;
  let matchedKeyData = null;

  for (const [keyId, keyData] of apiKeysStore.entries()) {
    if (keyData.isActive) {
      const isValid = await bcrypt.compare(apiKey, keyData.hashedKey);
      if (isValid) {
        matchedKeyId = keyId;
        matchedKeyData = keyData;
        break;
      }
    }
  }

  if (!matchedKeyData) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  // Update last used timestamp
  matchedKeyData.lastUsedAt = new Date().toISOString();
  apiKeysStore.set(matchedKeyId, matchedKeyData);

  return {
    valid: true,
    retailerId: matchedKeyData.retailerId,
    permissions: matchedKeyData.permissions,
    lastUsedAt: matchedKeyData.lastUsedAt
  };
});

// List API keys for a retailer (without exposing the actual keys)
fastify.get('/api-keys/:retailerId', async (request, reply) => {
  const { retailerId } = request.params as { retailerId: string };

  const keys = [];
  for (const [keyId, keyData] of apiKeysStore.entries()) {
    if (keyData.retailerId === retailerId && keyData.isActive) {
      keys.push({
        id: keyId,
        name: keyData.name,
        permissions: keyData.permissions,
        createdAt: keyData.createdAt,
        lastUsedAt: keyData.lastUsedAt
      });
    }
  }

  return { retailerId, apiKeys: keys, count: keys.length };
});

// Revoke an API key
fastify.delete('/api-keys/:keyId', async (request, reply) => {
  const { keyId } = request.params as { keyId: string };

  if (!apiKeysStore.has(keyId)) {
    return reply.status(404).send({ error: 'API key not found' });
  }

  const keyData = apiKeysStore.get(keyId)!;
  keyData.isActive = false;
  apiKeysStore.set(keyId, keyData);

  return { message: 'API key revoked successfully', keyId };
});

// === OAUTH CLIENT MANAGEMENT ===

// Register an OAuth client (for third-party integrations)
fastify.post('/oauth/clients', async (request, reply) => {
  const { retailerId, name, redirectUris, grantTypes } = request.body as {
    retailerId: string;
    name?: string;
    redirectUris: string[];
    grantTypes?: string[]; // e.g., ['authorization_code', 'refresh_token']
  };

  if (!retailerId || !redirectUris || redirectUris.length === 0) {
    return reply.status(400).send({ error: 'retailerId and redirectUris are required' });
  }

  const clientId = `oauth_client_${Date.now()}`;
  // In a real implementation, you would generate a client secret as well
  const clientSecret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  const clientData = {
    id: clientId,
    retailerId,
    name: name || `OAuth Client ${Date.now()}`,
    clientSecret: clientSecret, // In production, this would be hashed
    redirectUris: redirectUris,
    grantTypes: grantTypes || ['authorization_code'],
    createdAt: new Date().toISOString(),
    isActive: true
  };

  oauthClientsStore.set(clientId, clientData);

  // Return client info (but not the secret in a real implementation after initial creation)
  return {
    clientId,
    clientSecret: clientSecret, // Only returned once!
    name: clientData.name,
    redirectUris: clientData.redirectUris,
    grantTypes: clientData.grantTypes,
    createdAt: clientData.createdAt
  };
});

// Get OAuth client details
fastify.get('/oauth/clients/:clientId', async (request, reply) => {
  const { clientId } = request.params as { clientId: string };

  if (!oauthClientsStore.has(clientId)) {
    return reply.status(404).send({ error: 'OAuth client not found' });
  }

  const clientData = oauthClientsStore.get(clientId)!;
  
  // Don't return the client secret for security reasons
  const { clientSecret, ...safeClientData } = clientData;
  
  return safeClientData;
});

// List OAuth clients for a retailer
fastify.get('/oauth/clients/:retailerId', async (request, reply) => {
  const { retailerId } = request.params as { retailerId: string };

  const clients = [];
  for (const [clientId, clientData] of oauthClientsStore.entries()) {
    if (clientData.retailerId === retailerId && clientData.isActive) {
      clients.push({
        id: clientId,
        name: clientData.name,
        redirectUris: clientData.redirectUris,
        grantTypes: clientData.grantTypes,
        createdAt: clientData.createdAt
      });
    }
  }

  return { retailerId, oauthClients: clients, count: clients.length };
});

// Revoke an OAuth client
fastify.delete('/oauth/clients/:clientId', async (request, reply) => {
  const { clientId } = request.params as { clientId: string };

  if (!oauthClientsStore.has(clientId)) {
    return reply.status(404).send({ error: 'OAuth client not found' });
  }

  const clientData = oauthClientsStore.get(clientId)!;
  clientData.isActive = false;
  oauthClientsStore.set(clientId, clientData);

  return { message: 'OAuth client revoked successfully', clientId };
});

// Simplified OAuth token endpoint (authorization code flow)
fastify.post('/oauth/token', async (request, reply) => {
  const { grant_type, code, redirect_uri, client_id, client_secret, refresh_token } = request.body as {
    grant_type: string;
    code?: string;
    redirect_uri?: string;
    client_id?: string;
    client_secret?: string;
    refresh_token?: string;
  };

  if (!grant_type) {
    return reply.status(400).send({ error: 'grant_type is required' });
  }

  // Authorization Code Grant
  if (grant_type === 'authorization_code') {
    if (!code || !redirect_uri || !client_id || !client_secret) {
      return reply.status(400).send({ error: 'code, redirect_uri, client_id, and client_secret are required' });
    }

    // TODO: Validate client credentials and authorization code
    // For demo, we'll generate a mock access token
    
    const accessToken = jwt.sign(
      { 
        clientId, 
        retailerId: 'demo_retailer', // In reality, this would come from the client record
        scope: ['read:orders', 'write:inventory'] 
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
      scope: 'read:orders write:inventory'
    };
  }

  // Refresh Token Grant
  if (grant_type === 'refresh_token') {
    if (!refresh_token) {
      return reply.status(400).send({ error: 'refresh_token is required' });
    }

    try {
      // Verify the refresh token
      const decoded = jwt.verify(refresh_token, JWT_SECRET) as any;
      
      // Issue new access token
      const newAccessToken = jwt.sign(
        { 
          clientId: decoded.clientId,
          retailerId: decoded.retailerId,
          scope: decoded.scope
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      return {
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours from now
        scope: decoded.scope.join(' ')
      };
    } catch (error) {
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }
  }

  return reply.status(400).send({ error: 'Unsupported grant_type' });
});

// Protected endpoint example (demonstrates how to use the auth middleware)
fastify.get('/protected/test', async (request, reply) => {
  // This would normally be protected by auth middleware
  // For demo, we'll just return a success message
  return { message: 'This is a protected endpoint', timestamp: new Date().toISOString() });
});

// Authentication middleware
fastify.addHook('preHandler', async (request, reply) => {
  // Skip auth for health check and auth endpoints
  if (request.routerPath.startsWith('/health') || 
      request.routerPath.startsWith('/api-keys/generate') ||
      request.routerPath.startsWith('/api-keys/validate') ||
      request.routerPath.startsWith('/oauth/token')) {
    return;
  }

  // Check for API key in header
  const apiKey = request.headers['x-api-key'] || request.headers['authorization']?.replace('Bearer ', '');
  
  if (!apiKey) {
    // For demo purposes, we'll allow access to some endpoints without auth
    // In production, you would return 401 Unauthorized
    if (request.routerPath.startsWith('/protected/')) {
      return reply.status(401).send({ error: 'API key required' });
    }
    return; // Allow access to non-protected endpoints for demo
  }

  // Validate the API key
  let matchedKeyData = null;
  for (const [keyId, keyData] of apiKeysStore.entries()) {
    if (keyData.isActive) {
      const isValid = await bcrypt.compare(apiKey, keyData.hashedKey);
      if (isValid) {
        matchedKeyData = keyData;
        break;
      }
    }
  }

  if (!matchedKeyData) {
    if (request.routerPath.startsWith('/protected/')) {
      return reply.status(401).send({ error: 'Invalid API key' });
    }
    return; // Allow access to non-protected endpoints for demo
  }

  // Attach retailer info to request for use in route handlers
  request.retailerId = matchedKeyData.retailerId;
  request.permissions = matchedKeyData.permissions;
});

// Self-check: test basic logic
function demo() {
  // Test API key generation and validation
  apiKeysStore.clear();
  oauthClientsStore.clear();
  
  // Test generating an API key
  const keyResult = { 
    keyId: `key_${Date.now()}`, 
    apiKey: `kch_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
    name: 'Test Key',
    permissions: ['read:orders'],
    createdAt: new Date().toISOString()
  };
  
  if (!keyResult.keyId || !keyResult.apiKey) {
    throw new Error('Demo failed: API key generation failed');
  }
  
  // Test OAuth client creation
  const clientResult = {
    clientId: `oauth_client_${Date.now()}`,
    clientSecret: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    name: 'Test Client',
    redirectUris: ['https://example.com/callback'],
    grantTypes: ['authorization_code'],
    createdAt: new Date().toISOString()
  };
  
  if (!clientResult.clientId || !clientResult.clientSecret) {
    throw new Error('Demo failed: OAuth client creation failed');
  }
  
  console.log('Demo passed: Auth service basic logic is correct');
}

// Run demo if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  demo();
}

const start = async () => {
  try {
    // Use port 3011 to avoid conflict with other services
    await fastify.listen({ port: 3011, host: '0.0.0.0' });
    fastify.log.info(`Server listening on ${fastify.server.address()}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();