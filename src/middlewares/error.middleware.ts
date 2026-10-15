import AppError from '#src/errors/AppError.js';
import { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export const errorHandler: ErrorRequestHandler = (error, req, res, next) => { //eslint-disable-line
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      status: 'fail',
      errors: (error.issues).map(err => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
  }

  console.log(error);

  return res.status(500).json({ message: 'Erro interno do servidor' });
};