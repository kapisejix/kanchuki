import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { Sentry } from '../instrument.js';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFound(resource: string): AppError {
  return new AppError('NOT_FOUND', `${resource} not found`, 404);
}

export function forbidden(message = 'Access denied'): AppError {
  return new AppError('FORBIDDEN', message, 403);
}

export function planLimitExceeded(resource: string): AppError {
  return new AppError(
    'PLAN_LIMIT_EXCEEDED',
    `Your plan limit for ${resource} has been reached. Please upgrade.`,
    402,
  );
}

export function featureUnavailable(featureName: string): AppError {
  return new AppError(
    'FEATURE_UNAVAILABLE',
    `"${featureName}" is not available on your current plan. Please upgrade to a plan that includes this feature.`,
    402,
  );
}

export function validationError(message: string, field?: string): AppError {
  return new AppError('VALIDATION_ERROR', message, 422, field);
}

export function serviceUnavailable(message: string): AppError {
  return new AppError('SERVICE_UNAVAILABLE', message, 503);
}

export function errorHandler(
  error: FastifyError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    void reply.status(error.status).send({
      error: {
        code: error.code,
        message: error.message,
        field: error.field,
        status: error.status,
      },
    });
    return;
  }

  // Zod validation errors (from fastify-type-provider-zod)
  if (error.code === 'FST_ERR_VALIDATION') {
    void reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        status: 422,
      },
    });
    return;
  }

  // Rate limit
  if (error.statusCode === 429) {
    void reply.status(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many requests', status: 429 },
    });
    return;
  }

  // Zod validation errors (from z.parse() in route handlers)
  // NOTE: ZodError.message is a JSON-array string of issue messages
  // (e.g. '["Invalid email","Password is required"]') — build a
  // human-readable joined message instead so client error boxes show
  // "Invalid email, Password is required", not raw JSON.
  if (error.name === 'ZodError') {
    const issues = (error as unknown as { issues?: Array<{ message: string }> }).issues;
    const message = issues?.map((i) => i.message).join(', ') || 'Invalid input';
    void reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message,
        status: 422,
      },
    });
    return;
  }

  // Fastify protocol errors (malformed JSON body, content-length mismatch,
  // body-too-large, ...) carry their own client-error statusCode — respect it
  // instead of collapsing everything to a 500. A truncated request body is the
  // client's fault (400), not a server error — surfacing 500 here made the
  // contact form look broken on flaky networks.
  if (typeof error.statusCode === 'number' && error.statusCode >= 400 && error.statusCode < 500) {
    void reply.status(error.statusCode).send({
      error: {
        code: error.code ?? 'BAD_REQUEST',
        message: error.message,
        status: error.statusCode,
      },
    });
    return;
  }

  // Domain errors like MetaApiError (meta-graph.ts) carry a numeric `status`
  // (not Fastify's `statusCode`) — honor it for 4xx so e.g. the fan-out's
  // PUBLISH_FAILED surfaces as 400, not a misleading 500. When the domain
  // error attaches per-target `results` (the fan-out's all-failed rows), pass
  // them through so the client can show WHY each account failed (T-7.2).
  const errStatus = (error as unknown as { status?: unknown }).status;
  if (typeof errStatus === 'number' && errStatus >= 400 && errStatus < 500) {
    const results = (error as unknown as { results?: unknown }).results;
    void reply.status(errStatus).send({
      error: {
        code: error.code ?? 'BAD_REQUEST',
        message: error.message,
        status: errStatus,
        ...(Array.isArray(results) ? { results } : {}),
      },
    });
    return;
  }

  // Generic server error — don't leak internals in production
  reply.log.error(error);
  // Report to Sentry (no-op until SENTRY_DSN is set). AppError / validation /
  // 4xx branches above have already returned, so only genuine 500s reach here.
  Sentry.captureException(error);
  const isDev = process.env.NODE_ENV === 'development';
  const message = isDev ? (error.message ?? 'Something went wrong') : 'Something went wrong';
  void reply.status(500).send({
    error: {
      code: 'INTERNAL_ERROR',
      message,
      ...(isDev ? { stack: error.stack } : {}),
      status: 500,
    },
  });
}
