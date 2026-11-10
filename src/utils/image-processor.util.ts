import fs from 'fs';
import sharp from 'sharp';
import { AppError } from '#src/errors/app.error.js';
import { toSafeAbsolutePath, ensureUploadDirs } from '#utils/storage.util.js';

export { ensureUploadDirs };

// Desabilita cache de arquivos do Sharp para evitar locks no Windows
sharp.cache(false);

/**
 * Processa o buffer de imagem gerando thumb (400x300 fit: cover) e full (max 1280 fit: inside) em WebP com 80% qualidade.
 */
export async function processVehiclePhoto(inputPath: string): Promise<{ thumbBuffer: Buffer; fullBuffer: Buffer }> {
  try {
    await sharp(inputPath).metadata();

    const [thumbBuffer, fullBuffer] = await Promise.all([
      sharp(inputPath)
        .resize(400, 300, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
      sharp(inputPath).resize(1280, 960, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
    ]);

    return { thumbBuffer, fullBuffer};
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError('Formato de imagem inválido ou corrompido', 400);
  }
}

/**
 * Remove com segurança os arquivos físicos de miniatura e alta resolução.
 */
export async function deletePhotoFiles(thumbPath: string, fullPath: string): Promise<void> {
  const paths = [thumbPath, fullPath];

  for (const p of paths) {
    if (!p) continue;
    try {
      const absPath = toSafeAbsolutePath(p);
      await fs.promises.unlink(absPath);
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}

/**
 * Remove com segurança o arquivo físico de laudo PDF.
 */
export async function deleteReportFile(reportPath: string): Promise<void> {
  if (!reportPath) return;

  try {
    const absPath = toSafeAbsolutePath(reportPath);
    await fs.promises.unlink(absPath);
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code !== 'ENOENT') {
      throw err;
    }
  }
}
