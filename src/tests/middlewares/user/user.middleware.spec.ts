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
import { authenticateJWT } from '#middlewares/auth.middleware.js';
import { authorizeRoles } from '#middlewares/role.middleware.js';
import { validate } from '#middlewares/validate.middleware.js';
import { validateToken } from '#utils/jwt.util.js';

vi.mock('#utils/jwt.util.js', () => ({
  validateToken: vi.fn(),
}));

const mockedValidateToken = vi.mocked(validateToken);

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
      headers: { authorization: 'bearer token-valido' },
    });

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
    expect(mockedValidateToken).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('deve preencher req.user e chamar next com um token válido', () => {
    const payload = {
      id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      email: 'raul.ferreira@garagem.com',
      role: 'ADMIN',
    };
    const req = createRequest({
      headers: { authorization: 'Bearer token-valido' },
    });
    mockedValidateToken.mockReturnValue(payload as never);

    authenticateJWT(req, res, next);

    expect(mockedValidateToken).toHaveBeenCalledWith('token-valido');
    expect(req.user).toEqual(payload);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('deve retornar 401 quando o token for inválido ou expirado', () => {
    const req = createRequest({
      headers: { authorization: 'Bearer token-invalido' },
    });
    mockedValidateToken.mockImplementation(() => {
      throw new Error('TokenExpiredError');
    });

    authenticateJWT(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Token inválido ou expirado.',
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

  it('deve aplicar apenas o query parseado, mantendo body e params originais', () => {
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
    expect(req.body).toEqual(rawBody);
    expect(req.body.email).toBe('  USUARIO@GARAGEM.COM  ');
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
