import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '#src/errors/app.error.js';
import { storeRepository, type Store } from '#repositories/store.repository.js';

interface StoreFinder {
  findById(id: string): Promise<Store | null>;
}

const uuidSchema = z.string().uuid();

export const createTenantMiddleware = (storeRepo: StoreFinder = storeRepository) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawTenantId =
        req.user?.tenantId ||
        (req.headers['x-tenant-id'] as string | undefined) ||
        (req.query.tenant_id as string | undefined);

      const rawStoreId =
        (req.headers['x-store-id'] as string | undefined) ||
        (req.query.store_id as string | undefined);

      if (!rawTenantId && !rawStoreId) {
        return next(
          new AppError(
            'Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)',
            400
          )
        );
      }

      if (rawTenantId && !uuidSchema.safeParse(rawTenantId).success) {
        return next(new AppError('Identificador de empresa ou loja inválido', 400));
      }

      if (rawStoreId && !uuidSchema.safeParse(rawStoreId).success) {
        return next(new AppError('Identificador de empresa ou loja inválido', 400));
      }

      let resolvedTenantId: string | null = null;
      let resolvedStoreId: string | null = null;

      if (rawStoreId) {
        const store = await storeRepo.findById(rawStoreId);

        if (!store) {
          return next(new AppError('Loja não encontrada', 404));
        }

        if (rawTenantId && store.tenant_id !== rawTenantId) {
          return next(new AppError('Loja não pertence à empresa informada', 404));
        }

        resolvedTenantId = store.tenant_id ?? rawTenantId ?? null;
        resolvedStoreId = store.id;
      } else if (rawTenantId) {
        resolvedTenantId = rawTenantId;
        resolvedStoreId = req.user?.storeId ?? null;
      }

      if (!resolvedTenantId) {
        return next(
          new AppError(
            'Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)',
            400
          )
        );
      }

      req.tenantContext = {
        tenantId: resolvedTenantId,
        storeId: resolvedStoreId,
      };

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export const resolvePublicTenantContext = createTenantMiddleware();
