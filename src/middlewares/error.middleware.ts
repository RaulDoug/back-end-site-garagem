import { AppError } from '#src/errors/app.error.js';
import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import { ZodError } from 'zod';

export default function errorHandler(error: Error, req: Request, res: Response, next: NextFunction) { //eslint-disable-line
  console.log(error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof MulterError) {
    return res.status(400).json({ message: error.message });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({ message: error.message });
  }

  const pgCode = (error as { code?: string }).code;

  if (pgCode === '23505') {
    return res.status(409).json({ message: 'Registro duplicado ou já existente.' });
  }

  if (pgCode === '23503') {
    return res.status(409).json({
      message: 'Operação não permitida: registro vinculado a outros dados.',
    });
  }

  return res.status(500).json({ message: 'Erro interno do servidor' });
}