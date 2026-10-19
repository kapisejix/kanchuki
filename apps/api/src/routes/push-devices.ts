// F-046 slice 1 — retailer-app push device registry (Expo tokens).
// Registered at /v1/push-devices. Owner + manager + salesperson only: the paths are
// in the staff allowlists (plugins/auth.ts); catalog/support delegates are
// default-denied there, and the handlers re-check so a future allowlist edit
// cannot open the door (RC-034 shape).
import { prisma } from '@kanchuki/db';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isRealOwner } from '../plugins/auth.js';
import { forbidden, validationError } from '../plugins/error-handler.js';

const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]\s]{4,200}\]$/;

const RegisterSchema = z.object({
  expo_token: z.string().regex(TOKEN_RE, 'Invalid push token'),
  platform: z.enum(['android', 'ios']),
});

const UnregisterSchema = z.object({
  expo_token: z.string().regex(TOKEN_RE, 'Invalid push token'),
});

// Staff.id for a team member, null for the owner's own login. Delegates have no
// identity that receives enquiry pings.
function deviceOwner(request: FastifyRequest): { ok: boolean; staffId: string | null } {
  if (request.staffId) return { ok: true, staffId: request.staffId };
  return { ok: isRealOwner(request), staffId: null };
}

export const pushDeviceRoutes: FastifyPluginAsync = async (server) => {
  // ─── POST /push-devices/register — upsert; re-register revives a disabled token ─
  server.post('/register', async (request) => {
    const owner = deviceOwner(request);
    if (!owner.ok) throw forbidden('Only the shop team can register for notifications');
    const body = RegisterSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid', 'expo_token');
    }

    const now = new Date();
    // A token belongs to a physical device: if it signs in as someone else (or at
    // another shop) the row moves with it, so the previous person stops getting pings.
    await prisma.staffPushDevice.upsert({
      where: { expo_token: body.data.expo_token },
      create: {
        retailer_id: request.retailerId,
        staff_id: owner.staffId,
        expo_token: body.data.expo_token,
        platform: body.data.platform,
        last_seen_at: now,
      },
      update: {
        retailer_id: request.retailerId,
        staff_id: owner.staffId,
        platform: body.data.platform,
        last_seen_at: now,
        disabled_at: null,
      },
    });
    return { data: { registered: true } };
  });

  // ─── POST /push-devices/unregister — soft-disable (no DELETE grant, RC-049) ─
  // POST rather than DELETE: Fastify v5 rejects a bodyless/empty-JSON DELETE the
  // client would have to special-case (see the admin bodyless-POST note).
  server.post('/unregister', async (request) => {
    const owner = deviceOwner(request);
    if (!owner.ok) throw forbidden('Only the shop team can manage notifications');
    const body = UnregisterSchema.safeParse(request.body);
    if (!body.success) {
      throw validationError(body.error.issues[0]?.message ?? 'Invalid', 'expo_token');
    }

    // Scoped to the caller's retailer: knowing a token never lets you mute another shop's.
    await prisma.staffPushDevice.updateMany({
      where: {
        expo_token: body.data.expo_token,
        retailer_id: request.retailerId,
        disabled_at: null,
      },
      data: { disabled_at: new Date() },
    });
    return { data: { unregistered: true } };
  });
};
