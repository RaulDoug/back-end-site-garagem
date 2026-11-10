import { describe, expect, it } from 'vitest';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import fs from 'fs';
import { uploadVehiclePhotos, uploadInspectionReport } from '#middlewares/upload.middleware.js';
import { AppError } from '#src/errors/app.error.js';

function createTestApp() {
  const app = express();

  app.post(
    '/test-photos',
    uploadVehiclePhotos,
    async (req: Request, res: Response) => {
      const files = req.files as Express.Multer.File[];
      const fileData = files?.map((f) => ({
        originalname: f.originalname,
        mimetype: f.mimetype,
        size: f.size,
        hasPath: typeof f.path === 'string' && f.path.length > 0,
        path: f.path,
      }));

      // Limpeza dos arquivos temporários gerados no teste
      if (files) {
        for (const file of files) {
          if (file.path && fs.existsSync(file.path)) {
            await fs.promises.unlink(file.path);
          }
        }
      }

      res.status(200).json({
        success: true,
        count: files?.length || 0,
        files: fileData,
      });
    }
  );

  app.post(
    '/test-report',
    uploadInspectionReport,
    async (req: Request, res: Response) => {
      const filePath = req.file?.path;
      const fileData = {
        success: true,
        originalname: req.file?.originalname,
        mimetype: req.file?.mimetype,
        hasPath: typeof filePath === 'string' && filePath.length > 0,
      };

      if (filePath && fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }

      res.status(200).json(fileData);
    }
  );

  // Error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : 'Erro interno';
    res.status(500).json({ error: message });
  });

  return app;
}

describe('Upload Middleware', () => {
  const app = createTestApp();

  describe('uploadVehiclePhotos', () => {
    it('deve aceitar envio de imagens válidas (JPEG, PNG, WebP) em disco temporário', async () => {
      const fakeImage = Buffer.from('fake-jpeg-data');

      const res = await request(app)
        .post('/test-photos')
        .attach('photos', fakeImage, { filename: 'foto1.jpg', contentType: 'image/jpeg' })
        .attach('photos', fakeImage, { filename: 'foto2.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
      expect(res.body.files[0].hasPath).toBe(true);
    });

    it('deve rejeitar arquivo com tipo MIME não permitido (ex: text/plain)', async () => {
      const res = await request(app)
        .post('/test-photos')
        .attach('photos', Buffer.from('texto simples'), {
          filename: 'doc.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/formato|tipo|invalido|apenas imagens/i);
    });

    it('deve rejeitar imagem maior que 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB

      const res = await request(app)
        .post('/test-photos')
        .attach('photos', largeBuffer, {
          filename: 'grande.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/10MB|limite|tamanho/i);
    });
  });

  describe('uploadInspectionReport', () => {
    it('deve aceitar arquivo único PDF em disco temporário com MIME application/pdf', async () => {
      const fakePdf = Buffer.from('%PDF-1.4 fake pdf data');

      const res = await request(app)
        .post('/test-report')
        .attach('report', fakePdf, {
          filename: 'laudo.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.mimetype).toBe('application/pdf');
      expect(res.body.hasPath).toBe(true);
    });

    it('deve rejeitar arquivo que não seja PDF', async () => {
      const res = await request(app)
        .post('/test-report')
        .attach('report', Buffer.from('fake image'), {
          filename: 'imagem.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/apenas pdf|formato|invalido/i);
    });

    it('deve rejeitar laudo PDF maior que 20MB', async () => {
      const largePdf = Buffer.alloc(21 * 1024 * 1024); // 21MB

      const res = await request(app)
        .post('/test-report')
        .attach('report', largePdf, {
          filename: 'laudo-grande.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/20MB|limite|tamanho/i);
    });
  });
});
