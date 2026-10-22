// RC-080 — REQUIRE_UPLOAD_CONTENT_LENGTH turns the optional presign length into a hard
// requirement for every route that carries UPLOAD_URL_RATE_LIMIT, without editing 13 routes.
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../plugins/error-handler.js';
import { UPLOAD_URL_RATE_LIMIT, requireContentLengthHook } from './upload-guard.js';

async function build() {
  const server = Fastify();
  server.setErrorHandler(errorHandler);
  server.addHook('preValidation', requireContentLengthHook);
  server.post('/upload-url', UPLOAD_URL_RATE_LIMIT, async () => ({ ok: true }));
  server.post('/other', async () => ({ ok: true }));
  await server.ready();
  return server;
}

describe('requireContentLengthHook', () => {
  beforeEach(() => {
    delete process.env['REQUIRE_UPLOAD_CONTENT_LENGTH'];
  });
  afterEach(() => {
    delete process.env['REQUIRE_UPLOAD_CONTENT_LENGTH'];
  });

  it('flag off: a presign without content_length still passes (old app builds)', async () => {
    const server = await build();
    const res = await server.inject({ method: 'POST', url: '/upload-url', payload: { a: 1 } });
    expect(res.statusCode).toBe(200);
  });

  it('flag on: a presign without content_length is rejected with 422', async () => {
    process.env['REQUIRE_UPLOAD_CONTENT_LENGTH'] = 'true';
    const server = await build();
    const res = await server.inject({ method: 'POST', url: '/upload-url', payload: { a: 1 } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.field).toBe('content_length');
  });

  it('flag on: a presign with content_length passes', async () => {
    process.env['REQUIRE_UPLOAD_CONTENT_LENGTH'] = 'true';
    const server = await build();
    const res = await server.inject({
      method: 'POST',
      url: '/upload-url',
      payload: { content_length: 1234 },
    });
    expect(res.statusCode).toBe(200);
  });

  it('flag on: routes that are not presign routes are untouched', async () => {
    process.env['REQUIRE_UPLOAD_CONTENT_LENGTH'] = 'true';
    const server = await build();
    const res = await server.inject({ method: 'POST', url: '/other', payload: { a: 1 } });
    expect(res.statusCode).toBe(200);
  });
});
