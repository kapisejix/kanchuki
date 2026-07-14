import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function notFound(resource: string): AppError {
  return new AppError('NOT_FOUND', `${resource} not found`, 404)
}

export function forbidden(message = 'Access denied'): AppError {
  return new AppError('FORBIDDEN', message, 403)
}

export function planLimitExceeded(resource: string): AppError {
  return new AppError(
    'PLAN_LIMIT_EXCEEDED',
    `Your plan limit for ${resource} has been reached. Please upgrade.`,
    402,
  )
}

export function validationError(message: string, field?: string): AppError {
  return new AppError('VALIDATION_ERROR', message, 422, field)
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
    })
    return
  }

  // Zod validation errors (from fastify-type-provider-zod)
  if (error.code === 'FST_ERR_VALIDATION') {
    void reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message,
        status: 422,
      },
    })
    return
  }

  // Rate limit
  if (error.statusCode === 429) {
    void reply.status(429).send({
      error: { code: 'RATE_LIMITED', message: 'Too many requests', status: 429 },
    })
    return
  }

  // Zod validation errors (from z.parse() in route handlers)
  if (error.name === 'ZodError') {
    void reply.status(422).send({
      error: {
        code: 'VALIDATION_ERROR',
        message: (error as Error).message,
        status: 422,
      },
    })
    return
  }

  // Generic server error — don't leak internals
  reply.log.error(error)
  void reply.status(500).send({
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong', status: 500 },
  })
}
