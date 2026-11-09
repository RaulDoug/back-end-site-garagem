import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { AppError } from '#src/errors/app.error.js';

// Desabilita cache de arquivos do Sharp para evitar locks no Windows
sharp.cache(false);

const UPLOAD_BASE_DIR = path.resolve(process.cwd(), 'uploads/vehicles');
const THUMBS_DIR = path.join(UPLOAD_BASE_DIR, 'thumbs');
const FULL_DIR = path.join(UPLOAD_BASE_DIR, 'full');
const REPORTS_DIR = path.join(UPLOAD_BASE_DIR, 'reports');

/**
 * Garante que os diretórios necessários de armazenamento de arquivos físicos existam.
 */
export function ensureUploadDirs(): void {
  fs.mkdirSync(THUMBS_DIR, { recursive: true });
  fs.mkdirSync(FULL_DIR, { recursive: true });
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

/**
 * Converte um caminho relativo público (ex: '/uploads/vehicles/...') para caminho absoluto seguro.
 */
function toSafeAbsolutePath(relativePath: string): string {
  const normalized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  const absPath = path.resolve(process.cwd(), normalized);
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');

  // Proteção contra Path Traversal
  if (!absPath.startsWith(uploadsRoot)) {
    throw new AppError('Caminho de arquivo inválido', 400);
  }

  return absPath;
}

/**
 * Processa o buffer de imagem gerando thumb (400x300 fit: cover) e full (max 1280 fit: inside) em WebP com 80% qualidade.
 */
export async function processVehiclePhoto(
  buffer: Buffer,
  _vehicleId: string,
  photoId: string
): Promise<{ thumb_path: string; full_path: string }> {
  ensureUploadDirs();

  const thumbFilename = `${photoId}.webp`;
  const fullFilename = `${photoId}.webp`;

  const thumbAbsPath = path.join(THUMBS_DIR, thumbFilename);
  const fullAbsPath = path.join(FULL_DIR, fullFilename);

  try {
    const sharpInstance = sharp(buffer);
    // Valida se o buffer é imagem válida
    await sharpInstance.metadata();

    // Gera thumb: 400x300, fit cover, webp q80
    await sharp(buffer)
      .resize(400, 300, { fit: 'cover' })
      .webp({ quality: 80 })
      .toFile(thumbAbsPath);

    // Gera full: max 1280x960, fit inside, withoutEnlargement, webp q80
    await sharp(buffer)
      .resize(1280, 960, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(fullAbsPath);

    return {
      thumb_path: `/uploads/vehicles/thumbs/${thumbFilename}`,
      full_path: `/uploads/vehicles/full/${fullFilename}`,
    };
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
