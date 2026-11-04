import { AppError } from '#src/errors/app.error.js';
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export default function errorHandler(error: Error, req: Request, res: Response, next: NextFunction) { //eslint-disable-line
  console.log(error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(500).json({ message: 'Erro interno do servidor' });
}