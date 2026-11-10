import { describe, expect, it, afterAll } from 'vitest';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import {
  processVehiclePhoto,
  deletePhotoFiles,
  deleteReportFile,
  ensureUploadDirs,
} from '#utils/image-processor.util.js';

describe('image-processor util', () => {
  const testPhotoId = 'test-photo-uuid';
  const testDeletePhotoId = 'test-photo-delete-uuid';
  const testReportPath = '/uploads/vehicles/reports/test-report.pdf';
  const tempSourcePath = path.resolve(process.cwd(), 'uploads/vehicles/temp/test-source-sharp.jpg');

  afterAll(async () => {
    // Cleanup any lingering test files in uploads
    const pathsToClean = [
      tempSourcePath,
      path.resolve(process.cwd(), 'uploads/vehicles/thumbs', `${testPhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/full', `${testPhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/thumbs', `${testDeletePhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/full', `${testDeletePhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/reports', 'test-report.pdf'),
    ];
    for (const filePath of pathsToClean) {
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  });

  describe('ensureUploadDirs', () => {
    it('deve criar os diretórios de upload se não existirem', async () => {
      await ensureUploadDirs();
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/thumbs'))).toBe(true);
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/full'))).toBe(true);
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/reports'))).toBe(true);
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/temp'))).toBe(true);
    });
  });

  describe('processVehiclePhoto', () => {
    it('deve processar arquivo de imagem válido gerando thumbBuffer e fullBuffer em formato WebP', async () => {
      await ensureUploadDirs();

      await sharp({
        create: {
          width: 1600,
          height: 1200,
          channels: 3,
          background: { r: 255, g: 100, b: 50 },
        },
      })
        .jpeg()
        .toFile(tempSourcePath);

      const result = await processVehiclePhoto(tempSourcePath);

      expect(Buffer.isBuffer(result.thumbBuffer)).toBe(true);
      expect(Buffer.isBuffer(result.fullBuffer)).toBe(true);

      const thumbMetadata = await sharp(result.thumbBuffer).metadata();
      expect(thumbMetadata.format).toBe('webp');
      expect(thumbMetadata.width).toBe(400);
      expect(thumbMetadata.height).toBe(300);

      const fullMetadata = await sharp(result.fullBuffer).metadata();
      expect(fullMetadata.format).toBe('webp');
      expect(fullMetadata.width).toBeLessThanOrEqual(1280);
    });

    it('deve rejeitar caminho inválido ou corrompido com erro apropriado', async () => {
      const invalidPath = path.resolve(process.cwd(), 'uploads/vehicles/temp/invalid-fake.jpg');
      await fs.promises.writeFile(invalidPath, 'arquivo corrompido ou invalido');

      try {
        await expect(processVehiclePhoto(invalidPath)).rejects.toThrow();
      } finally {
        if (fs.existsSync(invalidPath)) {
          await fs.promises.unlink(invalidPath);
        }
      }
    });
  });

  describe('deletePhotoFiles', () => {
    it('deve remover os arquivos de imagem thumb e full do disco com segurança', async () => {
      await ensureUploadDirs();
      const thumbRelative = `/uploads/vehicles/thumbs/${testDeletePhotoId}.webp`;
      const fullRelative = `/uploads/vehicles/full/${testDeletePhotoId}.webp`;

      const thumbAbs = path.resolve(process.cwd(), `uploads/vehicles/thumbs/${testDeletePhotoId}.webp`);
      const fullAbs = path.resolve(process.cwd(), `uploads/vehicles/full/${testDeletePhotoId}.webp`);

      fs.writeFileSync(thumbAbs, 'fake-thumb');
      fs.writeFileSync(fullAbs, 'fake-full');

      expect(fs.existsSync(thumbAbs)).toBe(true);
      expect(fs.existsSync(fullAbs)).toBe(true);

      await deletePhotoFiles(thumbRelative, fullRelative);

      expect(fs.existsSync(thumbAbs)).toBe(false);
      expect(fs.existsSync(fullAbs)).toBe(false);
    });

    it('não deve lançar erro se os arquivos já não existirem', async () => {
      await expect(
        deletePhotoFiles('/uploads/vehicles/thumbs/inexistente.webp', '/uploads/vehicles/full/inexistente.webp')
      ).resolves.toBeUndefined();
    });
  });

  describe('deleteReportFile', () => {
    it('deve remover o arquivo físico de laudo PDF com segurança', async () => {
      await ensureUploadDirs();
      const reportAbs = path.resolve(process.cwd(), 'uploads/vehicles/reports/test-report.pdf');

      fs.writeFileSync(reportAbs, 'fake-pdf');
      expect(fs.existsSync(reportAbs)).toBe(true);

      await deleteReportFile(testReportPath);

      expect(fs.existsSync(reportAbs)).toBe(false);
    });

    it('não deve lançar erro se o laudo já não existir', async () => {
      await expect(
        deleteReportFile('/uploads/vehicles/reports/laudo-fantasma.pdf')
      ).resolves.toBeUndefined();
    });
  });
});
