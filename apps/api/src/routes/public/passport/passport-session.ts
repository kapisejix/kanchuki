// passport-session.ts — current shopper identity + logout (split from apps/api/src/routes/public/passport.ts — body byte-identical)
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync } from 'fastify';
import {
  COOKIE_DOMAIN,
  COOKIE_NAME,
  COOKIE_SECURE,
  getPassportSession,
  maskPhone,
} from './passport-helpers.js';
export const passportSessionRoutes: FastifyPluginAsync = async (server) => {
  // ─── GET /passport/me ──────────────────────────────────────────
  // Returns the current passport session info. Used by ContactGate
  // to determine returning vs first-time shopper.
  server.get('/me', async (request, reply) => {
    const session = await getPassportSession(request.headers.cookie || '');
    if (!session) {
      return reply
        .status(401)
        .send({ error: { code: 'NO_SESSION', message: 'Not authenticated' } });
    }

    const acct = session.customer_account;
    return reply.status(200).send({
      account: {
        id: acct.id,
        name: acct.name,
        phone_masked: maskPhone(acct.phone),
        usual_size: acct.usual_size,
        city: acct.city,
      },
    });
  });
  // ─── POST /passport/logout ─────────────────────────────────────
  // Revokes the current session and clears the cookie.
  server.post('/logout', async (request, reply) => {
    const cookieHeader = request.headers.cookie || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map((c) => {
        const [key, ...val] = c.trim().split('=');
        return [key!, val.join('=')];
      }),
    );
    const sessionId = cookies[COOKIE_NAME];

    if (sessionId) {
      await prisma.passportSession.updateMany({
        where: { id: sessionId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
    }

    // Clear the cookie
    const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'SameSite=Lax', 'Max-Age=0', 'Path=/'];
    if (COOKIE_SECURE) parts.push('Secure');
    if (process.env.NODE_ENV === 'production') {
      parts.push(`Domain=${COOKIE_DOMAIN}`);
    }
    reply.header('Set-Cookie', parts.join('; '));

    return reply.status(200).send({ ok: true });
  });
};
