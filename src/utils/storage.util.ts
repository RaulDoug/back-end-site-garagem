import fs from 'fs';
import path from 'path';
import { AppError } from '#src/errors/app.error.js';


const UPLOAD_BASE_DIR = path.resolve(process.cwd(), 'uploads/vehicles');

export const THUMBS_DIR = path.join(UPLOAD_BASE_DIR, 'thumbs');
export const FULL_DIR = path.join(UPLOAD_BASE_DIR, 'full');
export const REPORTS_DIR = path.join(UPLOAD_BASE_DIR, 'reports');
export const TEMP_DIR = path.join(UPLOAD_BASE_DIR, 'temp');

let isInitialized = false;

export async function ensureUploadDirs(): Promise<void> {
  if (isInitialized) return;

  await Promise.all(
    [THUMBS_DIR, FULL_DIR, REPORTS_DIR, TEMP_DIR].map( 
      async (dir) => fs.promises.mkdir(dir, { recursive: true })
    )
  );

  isInitialized = true;
}

export function toSafeAbsolutePath(relativePath: string): string {
  const normalized = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
  const absPath = path.resolve(process.cwd(), normalized);
  const uploadsRoot = path.resolve(process.cwd(), 'uploads');

  // Proteção contra Path Traversal
  if (!absPath.startsWith(uploadsRoot)) {
    throw new AppError('Caminho de arquivo inválido', 400);
  }

  return absPath;
}

export type StorageFolder = 'thumbs' | 'full' | 'reports';

export interface StorageProvider {
  save(
    folder: StorageFolder,
    filename: string,
    content: Buffer | string
  ): Promise<string>;
  delete(relativePath: string): Promise<void>;
  deleteTempFile(filepath: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  async save(
    folder: StorageFolder,
    filename: string,
    content: Buffer | string
  ): Promise<string> {
    const folderMap = {
      thumbs: THUMBS_DIR,
      full: FULL_DIR,
      reports: REPORTS_DIR,
    };

    const targetDir = folderMap[folder];
    const targetPath = path.join(targetDir, filename);

    if (typeof content === 'string') {
      await fs.promises.rename(content, targetPath);
    } else {
      await fs.promises.writeFile(targetPath, content);
    }


    return `/uploads/vehicles/${folder}/${filename}`;
  }

  async delete(relativePath: string): Promise<void> {
    try {
      const absPath = toSafeAbsolutePath(relativePath);
      await fs.promises.unlink(absPath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async deleteTempFile(filePath: string): Promise<void> {
    try {
      const absPath = toSafeAbsolutePath(filePath);
      await fs.promises.unlink(absPath);
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== 'ENOENT') {
        throw err;
      }
    }
  }
}