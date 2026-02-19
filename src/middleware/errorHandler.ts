import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err);

  // Zod validation errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      error: 'Validation error',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
  }

  // Prisma unique constraint (duplicate idempotency key race condition edge case)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ success: false, error: 'Duplicate request detected' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
  }

  // Business logic errors
  if (err instanceof Error) {
    if (err.message.includes('Insufficient balance')) {
      return res.status(422).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: err.message });
  }

  return res.status(500).json({ success: false, error: 'Internal server error' });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
}
