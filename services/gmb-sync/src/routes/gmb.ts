// src/routes/gmb.ts
import { FastifyInstance } from 'fastify';
import { prisma } from '@kanchuki/db';
import { encryptSecret, decryptSecret } from '@kanchuki/db/secrets';

export default async function (fastify: FastifyInstance) {
  // Helper function to get valid access token (refresh if expired)
  const getValidAccessToken = async (retailerId: string) => {
    const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
    if (!retailer) {
      throw new Error('Retailer not found');
    }

    if (!retailer.gmb_access_token || !retailer.gmb_refresh_token || !retailer.gmb_token_expiry) {
      throw new Error('GMB account not connected or missing tokens');
    }

    // Decrypt tokens
    const accessToken = decryptSecret(retailer.gmb_access_token);
    const refreshToken = decryptSecret(retailer.gmb_refresh_token);
    const tokenExpiry = retailer.gmb_token_expiry;

    // Check if token is expired (with 5 minute buffer)
    const now = new Date();
    if (now >= new Date(tokenExpiry.getTime() - 5 * 60 * 1000)) {
      // Token is expired or expiring soon, refresh it
      // ponytail: minimal refresh implementation - in real app, call Google OAuth2 API
      // For now, we'll simulate by generating new tokens (not secure, just for demo)
      const newAccessToken = 'refreshed_access_token_' + Date.now();
      const newRefreshToken = 'refreshed_refresh_token_' + Date.now();
      const newExpiryDate = new Date();
      newExpiryDate.setHours(newExpiryDate.getHours() + 1); // 1 hour expiry

      // Encrypt and store new tokens
      const encryptedAccessToken = encryptSecret(newAccessToken);
      const encryptedRefreshToken = encryptSecret(newRefreshToken);

      await prisma.retailer.update({
        where: { id: retailerId },
        data: {
          gmb_access_token: encryptedAccessToken,
          gmb_refresh_token: encryptedRefreshToken,
          gmb_token_expiry: newExpiryDate,
        }
      });

      return newAccessToken;
    }

    return accessToken;
  };

  // Connect GMB account (initiate OAuth flow)
  // In a real implementation, this would generate an OAuth URL and redirect the user to Google.
  // For now, we'll simulate by storing placeholder credentials.
  fastify.post('/connect', async (request, reply) => {
    const { retailerId, authCode } = request.body as {
      retailerId: string;
      authCode: string; // OAuth authorization code from Google
    };

    if (!retailerId || !authCode) {
      return reply.status(400).send({ error: 'retailerId and authCode are required' });
    }

    try {
      // Check if retailer exists
      const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
      if (!retailer) {
        return reply.status(404).send({ error: 'Retailer not found' });
      }

      // In a real implementation, we would exchange the authCode for access and refresh tokens
      // using the Google OAuth2 API.
      // For now, we'll simulate by creating dummy tokens.
      const dummyAccessToken = 'dummy_access_token_' + Date.now();
      const dummyRefreshToken = 'dummy_refresh_token_' + Date.now();
      const expiryDate = new Date();
      expiryDate.setHours(expiryDate.getHours() + 1); // 1 hour expiry

      // Encrypt the tokens before storing
      const encryptedAccessToken = encryptSecret(dummyAccessToken);
      const encryptedRefreshToken = encryptSecret(dummyRefreshToken);

      // Update retailer with GMB tokens
      // Note: We would also get the account ID and location ID from the API response.
      const updatedRetailer = await prisma.retailer.update({
        where: { id: retailerId },
        data: {
          gmb_access_token: encryptedAccessToken,
          gmb_refresh_token: encryptedRefreshToken,
          gmb_token_expiry: expiryDate,
          // We would set these from the API response:
          // gmb_account_id: 'dummy_account_id',
          // gmb_location_id: 'dummy_location_id'
        }
      });

      return reply.send({ message: 'GMB account connected successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Disconnect GMB account
  fastify.post('/disconnect', async (request, reply) => {
    const { retailerId } = request.body as { retailerId: string };

    if (!retailerId) {
      return reply.status(400).send({ error: 'retailerId is required' });
    }

    try {
      const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
      if (!retailer) {
        return reply.status(404).send({ error: 'Retailer not found' });
      }

      // Clear GMB fields
      await prisma.retailer.update({
        where: { id: retailerId },
        data: {
          gmb_account_id: null,
          gmb_location_id: null,
          gmb_access_token: null,
          gmb_refresh_token: null,
          gmb_token_expiry: null
        }
      });

      return reply.send({ message: 'GMB account disconnected successfully' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // Create a post on GMB
  fastify.post('/post', async (request, reply) => {
    const { retailerId, content, mediaIds } = request.body as {
      retailerId: string;
      content: string;
      mediaIds?: string[]; // IDs of media (photos/videos) uploaded to GMB
    };

    if (!retailerId || !content) {
      return reply.status(400).send({ error: 'retailerId and content are required' });
    }

    try {
      const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
      if (!retailer) {
        return reply.status(404).send({ error: 'Retailer not found' });
      }

// Check if GMB is connected
       if (!retailer.gmb_access_token || !retailer.gmb_refresh_token) {
         return reply.status(400).send({ error: 'GMB account not connected' });
       }

       // Get valid access token (refresh if expired)
       const accessToken = await getValidAccessToken(retailerId);

      // In a real implementation, we would call the Google My Business API to create a post.
      // For now, we'll simulate success.

      // We could also log the post to a GMBPost model if we want to keep a history.
      // We'll skip that for now.

      return reply.send({ message: 'Post created successfully on GMB' });
    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

// Get reviews for a retailer's GMB location
   fastify.get('/reviews', async (request, reply) => {
     const { retailerId } = request.query as { retailerId?: string };

     if (!retailerId) {
       return reply.status(400).send({ error: 'retailerId is required' });
     }

     try {
       const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
       if (!retailer) {
         return reply.status(404).send({ error: 'Retailer not found' });
       }

       if (!retailer.gmb_access_token || !retailer.gmb_refresh_token) {
         return reply.status(400).send({ error: 'GMB account not connected' });
       }

       // Get valid access token (refresh if expired)
       const accessToken = await getValidAccessToken(retailerId);

       // In a real implementation, we would call the Google My Business API to fetch reviews.
       // For now, we'll return an empty array.

       return reply.send({ reviews: [] });
     } catch (error) {
       fastify.log.error(error);
       return reply.status(500).send({ error: 'Internal server error' });
     }
   });

// Respond to a review
   fastify.post('/review-response', async (request, reply) => {
     const { retailerId, reviewId, responseText } = request.body as {
       retailerId: string;
       reviewId: string;
       responseText: string;
     };

     if (!retailerId || !reviewId || !responseText) {
       return reply.status(400).send({ error: 'retailerId, reviewId, and responseText are required' });
     }

     try {
       const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
       if (!retailer) {
         return reply.status(404).send({ error: 'Retailer not found' });
       }

       if (!retailer.gmb_access_token || !retailer.gmb_refresh_token) {
         return reply.status(400).send({ error: 'GMB account not connected' });
       }

       // Decrypt the access token
       const accessToken = await getValidAccessToken(retailerId);

       // In a real implementation, we would call the Google My Business API to respond to the review.
       // For now, we'll simulate success.

       return reply.send({ message: 'Review response posted successfully' });
     } catch (error) {
       fastify.log.error(error);
       return reply.status(500).send({ error: 'Internal server error' });
     }
   });

// Get Q&A for a retailer's GMB location
   fastify.get('/qa', async (request, reply) => {
     const { retailerId } = request.query as { retailerId?: string };

     if (!retailerId) {
       return reply.status(400).send({ error: 'retailerId is required' });
     }

     try {
       const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
       if (!retailer) {
         return reply.status(404).send({ error: 'Retailer not found' });
       }

       if (!retailer.gmb_access_token || !retailer.gmb_refresh_token) {
         return reply.status(400).send({ error: 'GMB account not connected' });
       }

       // Get valid access token (refresh if expired)
       const accessToken = await getValidAccessToken(retailerId);

       // In a real implementation, we would call the Google My Business API to fetch Q&A.
       // For now, we'll return an empty array.

       return reply.send({ qa: [] });
     } catch (error) {
       fastify.log.error(error);
       return reply.status(500).send({ error: 'Internal server error' });
     }
   });

// Answer a question
   fastify.post('/qa', async (request, reply) => {
     const { retailerId, questionId, answer } = request.body as {
       retailerId: string;
       questionId: string;
       answer: string;
     };

     if (!retailerId || !questionId || !answer) {
       return reply.status(400).send({ error: 'retailerId, questionId, and answer are required' });
     }

     try {
       const retailer = await prisma.retailer.findUnique({ where: { id: retailerId } });
       if (!retailer) {
         return reply.status(404).send({ error: 'Retailer not found' });
       }

       if (!retailer.gmb_access_token || !retailer.gmb_refresh_token) {
         return reply.status(400).send({ error: 'GMB account not connected' });
       }

       // Decrypt the access token
       const accessToken = await getValidAccessToken(retailerId);

       // In a real implementation, we would call the Google My Business API to answer the question.
       // For now, we'll simulate success.

       return reply.send({ message: 'Answer posted successfully' });
     } catch (error) {
       fastify.log.error(error);
       return reply.status(500).send({ error: 'Internal server error' });
     }
   });
}