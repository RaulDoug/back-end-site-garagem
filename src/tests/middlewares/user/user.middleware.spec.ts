import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import {
  authenticateJWT,
  authenticateOnboardingSecret,
  createAuthMiddleware,
  type AuthUserFinder,
} from '#middlewares/auth.middleware.js';
import { authorizeRoles, includeDeletedValidateRole } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { InvalidTokenError, validateToken } from '#utils/jwt.util.js';
import { userRepository } from '#repositories/user.repository.js';

vi.mock('#utils/jwt.util.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#utils/jwt.util.js')>();
  return {
    ...actual,
    validateToken: vi.fn(),
  };
});

vi.mock('#repositories/user.repository.js', () => ({
  userRepository: {
    findAuthUserById: vi.fn(),
  },
}));

const mockedValidateToken = vi.mocked(validateToken);
const mockedFindAuthUserById = vi.mocked(userRepository.findAuthUserById);

const createRequest = (overrides: Partial<Request> = {}) =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    ...overrides,
  }) as unknown as Request;

const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as Mock).mockReturnValue(res);
  (res.json as unknown as Mock).mockReturnValue(res);

  return res;
};

describe('authenticateJWT', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    res = createResponse();
    next = vi.fn() as unknown as NextFunction;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('deve retornar 401 quando o header Authorization não existir', () => {
    const req = createRequest();

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(mockedValidateToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando o header não usar o prefixo Bearer', () => {
    const req = createRequest({
      headers: { authorization: 'Basic token-valido' },
    });

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(mockedValidateToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('deve aceitar o prefixo bearer em minúsculo (case-insensitive)', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenant_id: 'tenant-uuid-1',
      store_id: null,
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(mockedValidateToken).toHaveBeenCalledWith('token-valido');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve extrair corretamente o token quando houver múltiplos espaços após Bearer', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer    token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenant_id: 'tenant-uuid-1',
      store_id: null,
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(mockedValidateToken).toHaveBeenCalledWith('token-valido');
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve retornar 401 sem chamar validateToken quando o header contiver apenas Bearer e espaços', () => {
    const req = createRequest({
      headers: { authorization: 'Bearer   ' },
    });

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(mockedValidateToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 401 sem chamar validateToken quando houver segmentos extras após o token', () => {
    const req = createRequest({
      headers: { authorization: 'Bearer token-1 token-2' },
    });

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(mockedValidateToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('deve preencher req.user e chamar next com um token válido', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenant_id: 'tenant-uuid-1',
      store_id: null,
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(mockedValidateToken).toHaveBeenCalledWith('token-valido');
    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando o token for inválido ou expirado', async () => {
    const req = createRequest({
      headers: { authorization: 'Bearer token-invalido' },
    });
    mockedValidateToken.mockImplementation(() => {
      throw new InvalidTokenError('Token inválido ou expirado.');
    });

    await authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Token inválido ou expirado.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve encaminhar erro inesperado de configuração em validateToken (ex: JWT_SECRET ausente) para next(error)', async () => {
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    const configError = new Error('Variável de ambiente JWT_SECRET não configurada.');
    mockedValidateToken.mockImplementation(() => {
      throw configError;
    });

    await authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(configError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('deve encaminhar erro de banco de dados para next(error) sem mascarar como 401', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    const dbError = new Error('Connection terminated unexpectedly');
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockRejectedValue(dbError);

    await authenticateJWT(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(dbError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando o usuário não existir no banco ou estiver deletado', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue(null);

    await authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve priorizar role e email atuais do banco sobre o payload antigo do token', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'antigo@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: 'novo@garagem.com',
      role: 'VISUALIZADOR',
      tenant_id: 'tenant-uuid-1',
      store_id: null,
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(mockedFindAuthUserById).toHaveBeenCalledTimes(1);
    expect(mockedFindAuthUserById).toHaveBeenCalledWith(payload.id);
    expect(req.user).toEqual({
      id: payload.id,
      email: 'novo@garagem.com',
      role: 'VISUALIZADOR',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('deve popular req.user.tenantId e req.user.storeId a partir do registro atualizado do banco de dados', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-token',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenant_id: 'tenant-db-updated',
      store_id: 'store-db-updated',
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(req.user).toEqual({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenantId: 'tenant-db-updated',
      storeId: 'store-db-updated',
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('deve retornar 401 se o usuário retornado do banco não possuir tenant_id vinculado', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenant_id: null,
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('não deve consultar tenantRepository separadamente ao autenticar um usuário válido', async () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-uuid-1',
      storeId: null,
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);
    mockedFindAuthUserById.mockResolvedValue({
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenant_id: 'tenant-uuid-1',
      store_id: null,
      deleted_at: null,
      is_active: true,
    } as never);

    await authenticateJWT(req, res, next);

    expect(mockedFindAuthUserById).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('createAuthMiddleware', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    res = createResponse();
    next = vi.fn() as unknown as NextFunction;
  });

  it('deve aceitar um AuthUserFinder injetado e consultar findAuthUserById uma única vez', async () => {
    const payload = {
      id: 'user-injected-1',
      email: 'injetado@garagem.com',
      role: 'VENDEDOR',
      tenantId: 'tenant-injected-1',
      storeId: 'store-injected-1',
    };
    const injectedRepo: AuthUserFinder = {
      findAuthUserById: vi.fn().mockResolvedValue({
        id: payload.id,
        email: payload.email,
        role: payload.role,
        tenant_id: payload.tenantId,
        store_id: payload.storeId,
        deleted_at: null,
        is_active: true,
      }),
    };
    mockedValidateToken.mockReturnValue(payload as never);

    const middleware = createAuthMiddleware(injectedRepo);
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });

    await middleware(req, res, next);

    expect(injectedRepo.findAuthUserById).toHaveBeenCalledTimes(1);
    expect(injectedRepo.findAuthUserById).toHaveBeenCalledWith(payload.id);
    expect(mockedFindAuthUserById).not.toHaveBeenCalled();
    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('deve retornar 401 quando o AuthUserFinder injetado retornar null (usuário ou tenant inválido)', async () => {
    const payload = {
      id: 'user-injected-2',
      email: 'injetado@garagem.com',
      role: 'ADMIN',
      tenantId: 'tenant-injected-2',
      storeId: null,
    };
    const injectedRepo: AuthUserFinder = {
      findAuthUserById: vi.fn().mockResolvedValue(null),
    };
    mockedValidateToken.mockReturnValue(payload as never);

    const middleware = createAuthMiddleware(injectedRepo);
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });

    await middleware(req, res, next);

    expect(injectedRepo.findAuthUserById).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authorizeRoles', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    res = createResponse();
    next = vi.fn() as unknown as NextFunction;
  });

  it('deve retornar 401 quando req.user não existir', () => {
    const req = createRequest();
    const middleware = authorizeRoles('ADMIN', 'VENDEDOR');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Usuário não autenticado.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 403 quando a role não estiver permitida', () => {
    const req = createRequest({
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        email: 'visualizador@garagem.com',
        role: 'VISUALIZADOR',
        tenantId: 'tenant-uuid-1',
        storeId: null,
      },
    });
    const middleware = authorizeRoles('ADMIN', 'VENDEDOR');

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso proibido. Permissão insuficiente.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve chamar next quando a role estiver permitida', () => {
    const req = createRequest({
      user: {
        id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        email: 'vendedor@garagem.com',
        role: 'VENDEDOR',
        tenantId: 'tenant-uuid-1',
        storeId: null,
      },
    });
    const middleware = authorizeRoles('ADMIN', 'VENDEDOR');

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('validate', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    res = createResponse();
    next = vi.fn() as unknown as NextFunction;
  });

  it('deve aplicar body e query parseados e sanitizados, mantendo params não declarados no schema', () => {
    const schema = z.object({
      body: z.object({
        email: z.string().trim().toLowerCase(),
      }),
      query: z.object({
        page: z.coerce.number(),
      }),
    });
    const rawBody = { email: '  USUARIO@GARAGEM.COM  ' };
    const rawParams = { id: 'parametro-original' };
    const req = createRequest({
      body: rawBody,
      params: rawParams,
      query: { page: '2' },
    });
    const middleware = validate(schema);

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.query).toEqual({ page: 2 });
    expect(req.body).toEqual({ email: 'usuario@garagem.com' });
    expect(req.body.email).toBe('usuario@garagem.com');
    expect(req.params).toEqual(rawParams);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('deve retornar 400 com field e message quando o schema falhar', () => {
    const schema = z.object({
      body: z.object({
        email: z.string().email('Formato de e-mail inválido'),
      }),
    });
    const req = createRequest({
      body: { email: 'email-invalido' },
    });
    const middleware = validate(schema);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      status: 'fail',
      errors: [
        {
          field: 'body.email',
          message: 'Formato de e-mail inválido',
        },
      ],
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve encaminhar erros que não sejam ZodError para next', () => {
    const error = new Error('Falha inesperada no schema');
    const schema = {
      parse: vi.fn(() => {
        throw error;
      }),
    } as unknown as ZodType;
    const req = createRequest();
    const middleware = validate(schema);

    middleware(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('includeDeletedValidateRole', () => {
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    res = createResponse();
    next = vi.fn() as unknown as NextFunction;
  });

  const baseTestUser = {
    id: 'user-id-1',
    email: 'user@garagem.com',
    role: 'VENDEDOR',
    tenantId: 'tenant-1',
    storeId: null,
  };

  it('deve chamar next quando include_deleted não for enviado', () => {
    const req = createRequest({ query: {}, user: baseTestUser });

    includeDeletedValidateRole(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve chamar next quando include_deleted=false mesmo se não for ADMIN', () => {
    const req = createRequest({ query: { include_deleted: 'false' }, user: baseTestUser });

    includeDeletedValidateRole(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve chamar next quando include_deleted=true e o usuário for ADMIN', () => {
    const req = createRequest({
      query: { include_deleted: 'true' },
      user: { ...baseTestUser, role: 'ADMIN' },
    });

    includeDeletedValidateRole(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve retornar 403 quando include_deleted=true e o usuário for VENDEDOR', () => {
    const req = createRequest({
      query: { include_deleted: 'true' },
      user: baseTestUser,
    });

    includeDeletedValidateRole(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso proibido. Permissão insuficiente para incluir registros excluídos.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('deve retornar 403 quando include_deleted=true e não houver req.user', () => {
    const req = createRequest({ query: { include_deleted: 'true' } });

    includeDeletedValidateRole(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authenticateOnboardingSecret', () => {
  const ORIGINAL_ENV = process.env;
  const VALID_SECRET = 'segredo-super-seguro-onboarding';
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...ORIGINAL_ENV, ONBOARDING_SECRET: VALID_SECRET };
    res = createResponse();
    next = vi.fn() as unknown as NextFunction;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('deve encaminhar erro de configuração para next(error) quando ONBOARDING_SECRET estiver ausente', () => {
    delete process.env.ONBOARDING_SECRET;
    const req = createRequest({
      headers: { 'x-onboarding-secret': VALID_SECRET },
    });

    authenticateOnboardingSecret(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwardedError = (next as unknown as Mock).mock.calls[0]?.[0];
    expect(forwardedError).toBeInstanceOf(Error);
    expect((forwardedError as Error).message).toBe(
      'Variável de ambiente ONBOARDING_SECRET não configurada.'
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('deve encaminhar erro de configuração para next(error) quando ONBOARDING_SECRET estiver vazia', () => {
    process.env.ONBOARDING_SECRET = '   ';
    const req = createRequest({
      headers: { 'x-onboarding-secret': VALID_SECRET },
    });

    authenticateOnboardingSecret(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const forwardedError = (next as unknown as Mock).mock.calls[0]?.[0];
    expect(forwardedError).toBeInstanceOf(Error);
    expect((forwardedError as Error).message).toBe(
      'Variável de ambiente ONBOARDING_SECRET não configurada.'
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    { desc: 'header ausente', headers: {} },
    { desc: 'header vazio', headers: { 'x-onboarding-secret': '   ' } },
    {
      desc: 'header como array',
      headers: { 'x-onboarding-secret': [VALID_SECRET, VALID_SECRET] },
    },
    { desc: 'tamanho diferente', headers: { 'x-onboarding-secret': 'curto' } },
    {
      desc: 'mesmo tamanho mas valor diferente',
      headers: { 'x-onboarding-secret': 'X'.repeat(VALID_SECRET.length) },
    },
  ])(
    'deve retornar 401 quando x-onboarding-secret for inválido ($desc)',
    ({ headers }) => {
      const req = createRequest({
        headers: headers as Request['headers'],
      });

      authenticateOnboardingSecret(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Acesso negado. Chave de provisionamento inválida ou ausente.',
      });
      expect(next).not.toHaveBeenCalled();
    }
  );

  it('deve chamar next() sem argumentos quando x-onboarding-secret corresponder a ONBOARDING_SECRET', () => {
    const req = createRequest({
      headers: { 'x-onboarding-secret': VALID_SECRET },
    });

    authenticateOnboardingSecret(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });
});
