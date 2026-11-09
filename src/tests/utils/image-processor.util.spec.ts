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
  const testVehicleId = 'test-veh-uuid';
  const testPhotoId = 'test-photo-uuid';
  const testDeletePhotoId = 'test-photo-delete-uuid';
  const testReportPath = '/uploads/vehicles/reports/test-report.pdf';

  afterAll(async () => {
    // Cleanup any lingering test files in uploads
    const pathsToClean = [
      path.resolve(process.cwd(), 'uploads/vehicles/thumbs', `${testPhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/full', `${testPhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/thumbs', `${testDeletePhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/full', `${testDeletePhotoId}.webp`),
      path.resolve(process.cwd(), 'uploads/vehicles/reports', 'test-report.pdf'),
    ];
    for (const filePath of pathsToClean) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  describe('ensureUploadDirs', () => {
    it('deve criar os diretórios de upload se não existirem', () => {
      ensureUploadDirs();
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/thumbs'))).toBe(true);
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/full'))).toBe(true);
      expect(fs.existsSync(path.resolve(process.cwd(), 'uploads/vehicles/reports'))).toBe(true);
    });
  });

  describe('processVehiclePhoto', () => {
    it('deve processar imagem válida gerando thumb e full em formato WebP', async () => {
      const inputBuffer = await sharp({
        create: {
          width: 1600,
          height: 1200,
          channels: 3,
          background: { r: 255, g: 100, b: 50 },
        },
      })
        .jpeg()
        .toBuffer();

      const result = await processVehiclePhoto(inputBuffer, testVehicleId, testPhotoId);

      expect(result).toEqual({
        thumb_path: `/uploads/vehicles/thumbs/${testPhotoId}.webp`,
        full_path: `/uploads/vehicles/full/${testPhotoId}.webp`,
      });

      const thumbFullPath = path.resolve(process.cwd(), `uploads/vehicles/thumbs/${testPhotoId}.webp`);
      const fullImageFullPath = path.resolve(process.cwd(), `uploads/vehicles/full/${testPhotoId}.webp`);

      expect(fs.existsSync(thumbFullPath)).toBe(true);
      expect(fs.existsSync(fullImageFullPath)).toBe(true);

      const thumbMetadata = await sharp(thumbFullPath).metadata();
      expect(thumbMetadata.format).toBe('webp');
      expect(thumbMetadata.width).toBe(400);
      expect(thumbMetadata.height).toBe(300);

      const fullMetadata = await sharp(fullImageFullPath).metadata();
      expect(fullMetadata.format).toBe('webp');
      expect(fullMetadata.width).toBeLessThanOrEqual(1280);
    });

    it('deve rejeitar buffer inválido com erro apropriado', async () => {
      const invalidBuffer = Buffer.from('arquivo corrompido ou invalido');

      await expect(
        processVehiclePhoto(invalidBuffer, testVehicleId, 'invalid-photo')
      ).rejects.toThrow();
    });
  });

  describe('deletePhotoFiles', () => {
    it('deve remover os arquivos de imagem thumb e full do disco com segurança', async () => {
      const thumbRelative = `/uploads/vehicles/thumbs/${testDeletePhotoId}.webp`;
      const fullRelative = `/uploads/vehicles/full/${testDeletePhotoId}.webp`;

      const thumbAbs = path.resolve(process.cwd(), `uploads/vehicles/thumbs/${testDeletePhotoId}.webp`);
      const fullAbs = path.resolve(process.cwd(), `uploads/vehicles/full/${testDeletePhotoId}.webp`);

      ensureUploadDirs();
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
      const reportAbs = path.resolve(process.cwd(), 'uploads/vehicles/reports/test-report.pdf');

      ensureUploadDirs();
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
