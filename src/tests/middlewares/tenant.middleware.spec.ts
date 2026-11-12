import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { createTenantMiddleware, resolvePublicTenantContext } from '#middlewares/tenant.middleware.js';
import { AppError } from '#src/errors/app.error.js';
import type { Store } from '#repositories/store.repository.js';

describe('Tenant Middleware - resolvePublicTenantContext', () => {
  let mockStoreRepo: {
    findById: (id: string) => Promise<Store | null>;
  };
  let findByIdMock: ReturnType<typeof vi.fn>;
  let middleware: ReturnType<typeof createTenantMiddleware>;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  const validTenantId = '11111111-1111-4111-a111-111111111111';
  const validStoreId = '22222222-2222-4222-a222-222222222222';

  beforeEach(() => {
    findByIdMock = vi.fn();
    mockStoreRepo = {
      findById: findByIdMock as (id: string) => Promise<Store | null>,
    };
    middleware = createTenantMiddleware(mockStoreRepo);
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

  it('deve usar o tenantId do req.user se já estiver autenticado', async () => {
    req.user = {
      id: 'user-1',
      email: 'admin@garagem.com',
      role: 'ADMIN',
      tenantId: validTenantId,
      storeId: validStoreId,
    };

    await middleware(req as Request, res as Response, next);

    expect(req.tenantContext).toEqual({
      tenantId: validTenantId,
      storeId: validStoreId,
    });
    expect(next).toHaveBeenCalledWith();
    expect(mockStoreRepo.findById).not.toHaveBeenCalled();
  });

  it('deve priorizar query store_id sobre req.user.storeId quando autenticado e loja pertencer ao tenant', async () => {
    const customStoreId = '33333333-3333-4333-a333-333333333333';
    req.user = {
      id: 'user-1',
      email: 'admin@garagem.com',
      role: 'ADMIN',
      tenantId: validTenantId,
      storeId: validStoreId,
    };
    req.query = { store_id: customStoreId };
    const mockStore: Partial<Store> = {
      id: customStoreId,
      tenant_id: validTenantId,
      name: 'Filial 2',
    };
    findByIdMock.mockResolvedValue(mockStore);

    await middleware(req as Request, res as Response, next);

    expect(findByIdMock).toHaveBeenCalledWith(customStoreId);
    expect(req.tenantContext).toEqual({
      tenantId: validTenantId,
      storeId: customStoreId,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('deve retornar 400 se usuário autenticado enviar query store_id com UUID inválido', async () => {
    req.user = {
      id: 'user-1',
      email: 'admin@garagem.com',
      role: 'ADMIN',
      tenantId: validTenantId,
      storeId: validStoreId,
    };
    req.query = { store_id: 'uuid-invalido' };

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Identificador de empresa ou loja inválido');
  });

  it('deve retornar 404 se usuário autenticado enviar query store_id de loja pertencente a outro tenant', async () => {
    const otherTenantId = '44444444-4444-4444-a444-444444444444';
    const otherStoreId = '55555555-5555-4555-a555-555555555555';
    req.user = {
      id: 'user-1',
      email: 'admin@garagem.com',
      role: 'ADMIN',
      tenantId: validTenantId,
      storeId: validStoreId,
    };
    req.query = { store_id: otherStoreId };
    const mockStore: Partial<Store> = {
      id: otherStoreId,
      tenant_id: otherTenantId,
      name: 'Loja de outro tenant',
    };
    findByIdMock.mockResolvedValue(mockStore);

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Loja não pertence à empresa informada');
  });

  it('deve resolver tenantId através do header x-tenant-id', async () => {
    req.headers = { 'x-tenant-id': validTenantId };

    await middleware(req as Request, res as Response, next);

    expect(req.tenantContext).toEqual({
      tenantId: validTenantId,
      storeId: null,
    });
    expect(next).toHaveBeenCalledWith();
    expect(mockStoreRepo.findById).not.toHaveBeenCalled();
  });

  it('deve resolver tenantId através da query tenant_id', async () => {
    req.query = { tenant_id: validTenantId };

    await middleware(req as Request, res as Response, next);

    expect(req.tenantContext).toEqual({
      tenantId: validTenantId,
      storeId: null,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('deve resolver tenantId e storeId quando apenas store_id for enviado', async () => {
    req.query = { store_id: validStoreId };
    const mockStore: Partial<Store> = {
      id: validStoreId,
      tenant_id: validTenantId,
      name: 'Matriz',
    };
    findByIdMock.mockResolvedValue(mockStore);

    await middleware(req as Request, res as Response, next);

    expect(mockStoreRepo.findById).toHaveBeenCalledWith(validStoreId);
    expect(req.tenantContext).toEqual({
      tenantId: validTenantId,
      storeId: validStoreId,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('deve resolver quando x-tenant-id e x-store-id forem enviados e loja pertencer ao tenant', async () => {
    req.headers = {
      'x-tenant-id': validTenantId,
      'x-store-id': validStoreId,
    };
    const mockStore: Partial<Store> = {
      id: validStoreId,
      tenant_id: validTenantId,
      name: 'Matriz',
    };
    findByIdMock.mockResolvedValue(mockStore);

    await middleware(req as Request, res as Response, next);

    expect(mockStoreRepo.findById).toHaveBeenCalledWith(validStoreId);
    expect(req.tenantContext).toEqual({
      tenantId: validTenantId,
      storeId: validStoreId,
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('deve retornar 404 quando store_id enviado não existir no banco', async () => {
    req.query = { store_id: validStoreId };
    findByIdMock.mockResolvedValue(null);

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Loja não encontrada');
  });

  it('deve retornar 404 quando store_id não pertencer ao tenant_id informado', async () => {
    const otherTenantId = '44444444-4444-4444-a444-444444444444';
    req.headers = { 'x-tenant-id': validTenantId };
    req.query = { store_id: validStoreId };
    const mockStore: Partial<Store> = {
      id: validStoreId,
      tenant_id: otherTenantId,
      name: 'Loja de outro tenant',
    };
    findByIdMock.mockResolvedValue(mockStore);

    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('Loja não pertence à empresa informada');
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

  it('deve retornar 400 quando nenhum identificador for enviado', async () => {
    await middleware(req as Request, res as Response, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const error = vi.mocked(next).mock.calls[0][0] as unknown as AppError;
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe(
      'Contexto da empresa ou loja é obrigatório (informe x-tenant-id, x-store-id, tenant_id ou store_id)'
    );
  });
});
