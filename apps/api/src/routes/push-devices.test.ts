// F-046 slice 1 — push device register / unregister.
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { staffCanAccess } from '../plugins/auth.js';
import { errorHandler } from '../plugins/error-handler.js';
import { pushDeviceRoutes } from './push-devices.js';

const db = vi.hoisted(() => ({
  upsert: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock('@kanchuki/db', () => ({
  prisma: { staffPushDevice: { upsert: db.upsert, updateMany: db.updateMany } },
}));

const TOKEN = 'ExponentPushToken[abcDEF123_-xyz]';
type Actor = 'owner' | 'manager' | 'salesperson' | 'catalog' | 'support';

async function call(actor: Actor, url: string, payload?: object, retailerId = 'ret_1') {
  const app = Fastify();
  app.setErrorHandler(errorHandler);
  app.decorateRequest('retailerId', '');
  app.decorateRequest('staffRole', null);
  app.decorateRequest('staffId', null);
  app.decorateRequest('catalogDelegate', null);
  app.decorateRequest('supportDelegate', null);
  app.addHook('preHandler', async (request) => {
    request.retailerId = retailerId;
    if (actor === 'manager' || actor === 'salesperson') {
      request.staffRole = actor;
      request.staffId = `stf_${actor}`;
    }
    if (actor === 'catalog') {
      request.catalogDelegate = { team_member_id: 'tm_1' } as typeof request.catalogDelegate;
    }
    if (actor === 'support') {
      request.supportDelegate = {
        team_member_id: 'tm_1',
        ticket_id: 't_1',
        grant_id: 'g_1',
        scope: 'GROWTH',
      } as typeof request.supportDelegate;
    }
  });
  await app.register(pushDeviceRoutes, { prefix: '/v1/push-devices' });
  const res = await app.inject({ method: 'POST', url, payload });
  await app.close();
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  db.upsert.mockResolvedValue({});
  db.updateMany.mockResolvedValue({ count: 1 });
});

describe('POST /v1/push-devices/register', () => {
  it('owner registers with staff_id null', async () => {
    const res = await call('owner', '/v1/push-devices/register', {
      expo_token: TOKEN,
      platform: 'android',
    });
    expect(res.statusCode).toBe(200);
    const arg = db.upsert.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ expo_token: TOKEN });
    expect(arg.create).toMatchObject({ retailer_id: 'ret_1', staff_id: null, platform: 'android' });
  });

  it.each(['manager', 'salesperson'] as const)('%s registers under their staff id', async (a) => {
    const res = await call(a, '/v1/push-devices/register', { expo_token: TOKEN, platform: 'ios' });
    expect(res.statusCode).toBe(200);
    expect(db.upsert.mock.calls[0]?.[0].create.staff_id).toBe(`stf_${a}`);
  });

  it('re-register revives a disabled token and moves it to the new owner', async () => {
    await call('manager', '/v1/push-devices/register', { expo_token: TOKEN, platform: 'ios' });
    const update = db.upsert.mock.calls[0]?.[0].update;
    expect(update).toMatchObject({
      retailer_id: 'ret_1',
      staff_id: 'stf_manager',
      disabled_at: null,
    });
  });

  it.each(['catalog', 'support'] as const)('%s delegate is refused, nothing written', async (a) => {
    const res = await call(a, '/v1/push-devices/register', { expo_token: TOKEN, platform: 'ios' });
    expect(res.statusCode).toBe(403);
    expect(db.upsert).not.toHaveBeenCalled();
  });

  it.each([
    { expo_token: 'not-a-token', platform: 'android' },
    { expo_token: 'ExponentPushToken[]', platform: 'android' },
    { expo_token: TOKEN, platform: 'web' },
    { platform: 'android' },
  ])('rejects bad body %j with 422', async (payload) => {
    const res = await call('owner', '/v1/push-devices/register', payload);
    expect(res.statusCode).toBe(422);
    expect(db.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /v1/push-devices/unregister', () => {
  it('soft-disables, scoped to the caller retailer', async () => {
    const res = await call('salesperson', '/v1/push-devices/unregister', { expo_token: TOKEN });
    expect(res.statusCode).toBe(200);
    const arg = db.updateMany.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ expo_token: TOKEN, retailer_id: 'ret_1', disabled_at: null });
    expect(arg.data.disabled_at).toBeInstanceOf(Date);
  });

  it('delegates are refused', async () => {
    const res = await call('support', '/v1/push-devices/unregister', { expo_token: TOKEN });
    expect(res.statusCode).toBe(403);
    expect(db.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a malformed token with 422', async () => {
    const res = await call('owner', '/v1/push-devices/unregister', { expo_token: 'x' });
    expect(res.statusCode).toBe(422);
  });
});

describe('staff allowlist', () => {
  it.each(['manager', 'salesperson'])(
    '%s may register/unregister, nothing else under the prefix',
    (role) => {
      expect(staffCanAccess('POST', '/v1/push-devices/register', role)).toBe(true);
      expect(staffCanAccess('POST', '/v1/push-devices/unregister', role)).toBe(true);
      expect(staffCanAccess('GET', '/v1/push-devices', role)).toBe(false);
      expect(staffCanAccess('POST', '/v1/push-devices/other', role)).toBe(false);
    },
  );
});
