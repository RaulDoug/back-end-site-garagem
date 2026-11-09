import { Request, Response, NextFunction } from 'express';
import multer, { MulterError } from 'multer';
import { AppError } from '#src/errors/app.error.js';

const storage = multer.memoryStorage();

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_REPORT_MIMES = ['application/pdf'];

const MAX_PHOTO_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_REPORT_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_PHOTOS_COUNT = 15;

const multerPhotos = multer({
  storage,
  limits: {
    fileSize: MAX_PHOTO_SIZE,
    files: MAX_PHOTOS_COUNT,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype)) {
      cb(new AppError('Formato de arquivo inválido. Apenas imagens JPEG, PNG ou WebP são permitidas', 400));
      return;
    }
    cb(null, true);
  },
}).array('photos', MAX_PHOTOS_COUNT);

const multerReport = multer({
  storage,
  limits: {
    fileSize: MAX_REPORT_SIZE,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_REPORT_MIMES.includes(file.mimetype)) {
      cb(new AppError('Formato de arquivo inválido. Apenas PDF é permitido', 400));
      return;
    }
    cb(null, true);
  },
}).single('report');

export const uploadVehiclePhotos = (req: Request, res: Response, next: NextFunction): void => {
  multerPhotos(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('O arquivo excede o limite máximo permitido de 10MB', 400));
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return next(new AppError('Campo de upload inesperado ou limite de 15 fotos excedido', 400));
        }
        return next(new AppError(`Erro no envio de fotos: ${err.message}`, 400));
      }
      return next(err);
    }
    next();
  });
};

export const uploadInspectionReport = (req: Request, res: Response, next: NextFunction): void => {
  multerReport(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('O arquivo excede o limite máximo permitido de 20MB', 400));
        }
        return next(new AppError(`Erro no envio do laudo: ${err.message}`, 400));
      }
      return next(err);
    }
    next();
  });
};
