import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err, req, res, next) => {
  // Handle Zod validation errors cleanly
  if (err instanceof ZodError) {
    const fieldErrors = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));

    return res.status(400).json({
      status: 'error',
      code: 'VALIDATION_ERROR',
      message: fieldErrors[0]?.message || 'Invalid input provided.',
      details: fieldErrors
    });
  }

  // Handle Prisma unique constraint violations (e.g., duplicate idempotencyKey)
  if (err.code === 'P2002') {
    return res.status(409).json({
      status: 'error',
      code: 'DUPLICATE_RESOURCE',
      message: 'A duplicate resource conflict occurred. This action may already have been processed.'
    });
  }

  // Handle Prisma foreign key constraint violations
  if (err.code === 'P2003') {
    return res.status(400).json({
      status: 'error',
      code: 'INVALID_REFERENCE',
      message: 'Referenced entity does not exist or has been removed.'
    });
  }

  const statusCode = err.statusCode || (err.code === 'P2025' ? 404 : 500);
  const errorCode = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');
  
  // Log the full error internally
  logger.error({
    err: {
      message: err.message,
      stack: err.stack,
      code: errorCode,
      details: err.details
    },
    req: {
      method: req.method,
      url: req.originalUrl,
      ip: req.socket ? req.ip : 'unknown'
    }
  }, `Request error: ${err.message}`);

  // Safe client response: never leak raw SQL or database internal paths
  const isInternalServerError = statusCode >= 500 && !(err instanceof AppError);
  const safeMessage = isInternalServerError
    ? 'An unexpected error occurred. Please try again later.'
    : err.message;

  const response = {
    status: 'error',
    code: errorCode,
    message: safeMessage
  };

  if (err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
};

export const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    status: 'error',
    code: 'NOT_FOUND',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
};
