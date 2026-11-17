import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  createTenantMiddleware,
  resolvePublicTenantContext,
  type StoreFinder,
  type TenantFinder,
} from '#middlewares/tenant.middleware.js';
import { AppError } from '#src/errors/app.error.js';
import type { Store } from '#repositories/store.repository.js';
import type { Tenant } from '#repositories/tenant.repository.js';

describe('Tenant Middleware - resolvePublicTenantContext', () => {
  let mockStoreRepo: StoreFinder;
  let mockTenantRepo: TenantFinder;
  let findStoreByIdMock: ReturnType<typeof vi.fn>;
  let findTenantByIdMock: ReturnType<typeof vi.fn>;
  let middleware: ReturnType<typeof createTenantMiddleware>;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  const validTenantId = '11111111-1111-4111-a111-111111111111';
  const validStoreId = '22222222-2222-4222-a222-222222222222';
  const otherTenantId = '44444444-4444-4444-a444-444444444444';
  const otherStoreId = '55555555-5555-4555-a555-555555555555';

  const makeActiveTenant = (overrides: Partial<Tenant> = {}): Tenant => ({
    id: validTenantId,
    corporate_name: 'Garagem Alpha Ltda',
    trade_name: 'Alpha Motors',
    cnpj: '12345678000195',
    is_active: true,
    created_at: new Date(),
    deleted_at: null,
    ...overrides,
  });

  const makeActiveStore = (overrides: Partial<Store> = {}): Store => ({
    id: validStoreId,
    tenant_id: validTenantId,
    name: 'Matriz',
    phone: '37999999999',
    zip_code: '35500000',
    street: 'Av. Principal',
    number: '100',
    complement: null,
    neighborhood: 'Centro',
    city: 'Divinópolis',
    state: 'MG',
    cnpj: '98765432000100',
    is_active: true,
    deleted_at: null,
    created_at: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    findStoreByIdMock = vi.fn();
    findTenantByIdMock = vi.fn();
    mockStoreRepo = {
      findById: findStoreByIdMock as (id: string) => Promise<Store | null>,
    };
    mockTenantRepo = {
      findById: findTenantByIdMock as (id: string) => Promise<Tenant | null>,
    };
    middleware = createTenantMiddleware(mockStoreRepo, mockTenantRepo);
    req = {
      headers: {},
      query: {},
    };
    res = {};
    next = vi.fn() as unknown as NextFunction;
  });

  it('deve exportar resolvePublicTenantContext como função middleware padrão', () => {
    expect(typeof resolvePublicTenantContext).toBe('function');
  });

  describe('Isolamento de fronteira pública (ignorar req.user)', () => {
    it('deve ignorar req.user e retornar 400 se nenhum header ou query pública for enviado', async () => {
      req.user = {
        id: 'user-1',
        email: 'admin@garagem.com',
        role: 'ADMIN',
        tenantId: validTenantId,
        storeId: validStoreId,
      };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe(
        'Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)'
      );
      expect(req.tenantContext).toBeUndefined();
      expect(findStoreByIdMock).not.toHaveBeenCalled();
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve ignorar req.user e resolver exclusivamente pelos identificadores públicos da requisição', async () => {
      req.user = {
        id: 'user-1',
        email: 'admin@garagem.com',
        role: 'ADMIN',
        tenantId: otherTenantId,
        storeId: otherStoreId,
      };
      req.headers = { 'x-tenant-id': validTenantId };
      findTenantByIdMock.mockResolvedValue(makeActiveTenant({ id: validTenantId }));

      await middleware(req as Request, res as Response, next);

      expect(findTenantByIdMock).toHaveBeenCalledWith(validTenantId);
      expect(req.tenantContext).toEqual({
        tenantId: validTenantId,
        storeId: null,
      });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Validação de presença, formato UUID e tipos malformados', () => {
    it('deve retornar 400 quando nenhum identificador for enviado', async () => {
      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe(
        'Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)'
      );
    });

    it('deve retornar 400 quando tenant_id for um UUID inválido', async () => {
      req.headers = { 'x-tenant-id': 'uuid-invalido' };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
    });

    it('deve retornar 400 quando store_id for um UUID inválido', async () => {
      req.query = { store_id: 'invalid-store-uuid' };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
    });

    it('deve retornar 400 quando query tenant_id vier repetida como array', async () => {
      req.query = { tenant_id: [validTenantId, otherTenantId] };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando query store_id vier repetida como array junto de x-tenant-id válido', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      req.query = { store_id: [validStoreId, otherStoreId] };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
      expect(findStoreByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando query store_id vier como string vazia junto de x-tenant-id válido', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      req.query = { store_id: '' };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
    });

    it('deve retornar 400 quando query tenant_id vier como objeto ParsedQs', async () => {
      req.query = { tenant_id: { nested: validTenantId } } as unknown as Request['query'];

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
    });

    it('deve retornar 400 quando header x-tenant-id vier como string vazia mesmo com query tenant_id válido', async () => {
      req.headers = { 'x-tenant-id': '' };
      req.query = { tenant_id: validTenantId };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 400 quando header x-store-id vier como string vazia mesmo com query store_id válido', async () => {
      req.headers = { 'x-store-id': '' };
      req.query = { store_id: validStoreId };

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe('Identificador de empresa ou loja inválido');
      expect(findStoreByIdMock).not.toHaveBeenCalled();
    });
  });

  describe('Resolução e validação de empresa (tenant)', () => {
    it('deve resolver tenantId através do header x-tenant-id quando empresa estiver ativa', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      findTenantByIdMock.mockResolvedValue(makeActiveTenant());

      await middleware(req as Request, res as Response, next);

      expect(findTenantByIdMock).toHaveBeenCalledWith(validTenantId);
      expect(findStoreByIdMock).not.toHaveBeenCalled();
      expect(req.tenantContext).toEqual({
        tenantId: validTenantId,
        storeId: null,
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('deve resolver tenantId através da query tenant_id quando empresa estiver ativa', async () => {
      req.query = { tenant_id: validTenantId };
      findTenantByIdMock.mockResolvedValue(makeActiveTenant());

      await middleware(req as Request, res as Response, next);

      expect(findTenantByIdMock).toHaveBeenCalledWith(validTenantId);
      expect(req.tenantContext).toEqual({
        tenantId: validTenantId,
        storeId: null,
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('deve retornar 404 quando tenant_id não existir no banco (tenant fantasma)', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      findTenantByIdMock.mockResolvedValue(null);

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Empresa não encontrada');
      expect(req.tenantContext).toBeUndefined();
    });

    it('deve retornar 404 quando tenant estiver inativo (is_active: false)', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      findTenantByIdMock.mockResolvedValue(makeActiveTenant({ is_active: false }));

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Empresa não encontrada');
    });

    it('deve retornar 404 quando tenant estiver soft-deleted (deleted_at preenchido)', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      findTenantByIdMock.mockResolvedValue(makeActiveTenant({ deleted_at: new Date() }));

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Empresa não encontrada');
    });
  });

  describe('Resolução e validação de loja (store) + anti-enumeração', () => {
    it('deve resolver tenantId e storeId quando apenas query store_id for enviado', async () => {
      req.query = { store_id: validStoreId };
      findStoreByIdMock.mockResolvedValue(makeActiveStore());
      findTenantByIdMock.mockResolvedValue(makeActiveTenant());

      await middleware(req as Request, res as Response, next);

      expect(findStoreByIdMock).toHaveBeenCalledWith(validStoreId);
      expect(findTenantByIdMock).toHaveBeenCalledWith(validTenantId);
      expect(req.tenantContext).toEqual({
        tenantId: validTenantId,
        storeId: validStoreId,
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('deve resolver quando x-tenant-id e x-store-id forem enviados e loja pertencer ao tenant ativo', async () => {
      req.headers = {
        'x-tenant-id': validTenantId,
        'x-store-id': validStoreId,
      };
      findStoreByIdMock.mockResolvedValue(makeActiveStore());
      findTenantByIdMock.mockResolvedValue(makeActiveTenant());

      await middleware(req as Request, res as Response, next);

      expect(findStoreByIdMock).toHaveBeenCalledWith(validStoreId);
      expect(findTenantByIdMock).toHaveBeenCalledWith(validTenantId);
      expect(req.tenantContext).toEqual({
        tenantId: validTenantId,
        storeId: validStoreId,
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('deve retornar 404 quando store_id enviado não existir no banco', async () => {
      req.query = { store_id: validStoreId };
      findStoreByIdMock.mockResolvedValue(null);

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Loja não encontrada');
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 404 quando loja estiver inativa (is_active: false)', async () => {
      req.query = { store_id: validStoreId };
      findStoreByIdMock.mockResolvedValue(makeActiveStore({ is_active: false }));

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Loja não encontrada');
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 404 quando loja estiver soft-deleted (deleted_at preenchido)', async () => {
      req.query = { store_id: validStoreId };
      findStoreByIdMock.mockResolvedValue(makeActiveStore({ deleted_at: new Date() }));

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Loja não encontrada');
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 404 com a mensagem unificada "Loja não encontrada" quando store_id pertencer a outro tenant', async () => {
      req.headers = { 'x-tenant-id': validTenantId };
      req.query = { store_id: validStoreId };
      findStoreByIdMock.mockResolvedValue(makeActiveStore({ tenant_id: otherTenantId }));

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Loja não encontrada');
      expect(findTenantByIdMock).not.toHaveBeenCalled();
    });

    it('deve retornar 404 com "Loja não encontrada" quando apenas store_id ativo for enviado mas sua empresa estiver inativa', async () => {
      req.query = { store_id: validStoreId };
      findStoreByIdMock.mockResolvedValue(makeActiveStore());
      findTenantByIdMock.mockResolvedValue(makeActiveTenant({ is_active: false }));

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
      expect(error.statusCode).toBe(404);
      expect(error.message).toBe('Loja não encontrada');
      expect(req.tenantContext).toBeUndefined();
    });
  });

  describe('Tratamento de erros inesperados', () => {
    it('deve repassar erro inesperado do repositório para next(error)', async () => {
      const dbError = new Error('Falha de conexão com o banco');
      req.headers = { 'x-tenant-id': validTenantId };
      findTenantByIdMock.mockRejectedValue(dbError);

      await middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });
  });
});
