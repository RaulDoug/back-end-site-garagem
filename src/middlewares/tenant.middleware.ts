import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '#src/errors/app.error.js';
import { storeRepository, type Store } from '#repositories/store.repository.js';
import { tenantRepository, type Tenant } from '#repositories/tenant.repository.js';

export interface StoreFinder {
  findById(id: string): Promise<Store | null>;
}

export interface TenantFinder {
  findById(id: string): Promise<Tenant | null>;
}

const uuidSchema = z.string().uuid();

const MISSING_CONTEXT_MESSAGE =
  'Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)';
const INVALID_ID_MESSAGE = 'Identificador de empresa ou loja inválido';
const STORE_NOT_FOUND_MESSAGE = 'Loja não encontrada';
const TENANT_NOT_FOUND_MESSAGE = 'Empresa não encontrada';

const pickIdentifier = (headerValue: unknown, queryValue: unknown): unknown => {
  if (headerValue !== undefined) {
    return headerValue;
  }
  return queryValue;
};

type ParsedUuidResult =
  | { valid: true; value: string | undefined }
  | { valid: false };

const parseOptionalUuid = (rawValue: unknown): ParsedUuidResult => {
  if (rawValue === undefined) {
    return { valid: true, value: undefined };
  }

  const parsed = uuidSchema.safeParse(rawValue);
  if (!parsed.success) {
    return { valid: false };
  }

  return { valid: true, value: parsed.data };
};

export const createTenantMiddleware = (
  storeRepo: StoreFinder = storeRepository,
  tenantRepo: TenantFinder = tenantRepository
) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawTenantId = pickIdentifier(req.headers['x-tenant-id'], req.query.tenant_id);
      const rawStoreId = pickIdentifier(req.headers['x-store-id'], req.query.store_id);

      if (rawTenantId === undefined && rawStoreId === undefined) {
        return next(new AppError(MISSING_CONTEXT_MESSAGE, 400));
      }

      const parsedTenant = parseOptionalUuid(rawTenantId);
      if (!parsedTenant.valid) {
        return next(new AppError(INVALID_ID_MESSAGE, 400));
      }

      const parsedStore = parseOptionalUuid(rawStoreId);
      if (!parsedStore.valid) {
        return next(new AppError(INVALID_ID_MESSAGE, 400));
      }

      const tenantId = parsedTenant.value;
      const storeId = parsedStore.value;

      let resolvedTenantId: string | undefined = tenantId;
      let resolvedStoreId: string | null = null;

      if (storeId) {
        const store = await storeRepo.findById(storeId);

        if (!store || store.deleted_at != null || !store.is_active) {
          return next(new AppError(STORE_NOT_FOUND_MESSAGE, 404));
        }

        // Unifica erro com loja inexistente para evitar enumeração de IDs entre empresas
        if (tenantId && store.tenant_id !== tenantId) {
          return next(new AppError(STORE_NOT_FOUND_MESSAGE, 404));
        }

        resolvedTenantId = store.tenant_id;
        resolvedStoreId = store.id;
      }

      if (!resolvedTenantId) {
        return next(new AppError(MISSING_CONTEXT_MESSAGE, 400));
      }

      const tenant = await tenantRepo.findById(resolvedTenantId);
      if (!tenant || tenant.deleted_at != null || !tenant.is_active) {
        const notFoundMessage = storeId ? STORE_NOT_FOUND_MESSAGE : TENANT_NOT_FOUND_MESSAGE;
        return next(new AppError(notFoundMessage, 404));
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
