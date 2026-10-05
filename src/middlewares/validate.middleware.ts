import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodType } from 'zod';

export const validate = (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    }) as { query?: unknown };

    if (parsed.query) {
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }

    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        status: 'fail',
        errors: (error.issues).map(err => ({
          field: err.path.join('.'),
          message: err.message,
        })),
      });
    }
    return next(error);
  }
};