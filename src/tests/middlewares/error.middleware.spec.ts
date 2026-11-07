import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import errorHandler from '#middlewares/error.middleware.js';
import { AppError, BadRequestError, NotFoundError } from '#src/errors/app.error.js';

const createRequest = () => ({} as Request);

const createResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;

  (res.status as unknown as Mock).mockReturnValue(res);
  (res.json as unknown as Mock).mockReturnValue(res);

  return res;
};

const next: NextFunction = vi.fn();

describe('error.middleware', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    req = createRequest();
    res = createResponse();
  });

  it('deve responder com o statusCode e a mensagem do AppError', () => {
    const error = new AppError('Acesso não autorizado', 401);

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: 'Acesso não autorizado' });
  });

  it('deve responder com status 404 para NotFoundError', () => {
    const error = new NotFoundError('Recurso não encontrado');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Recurso não encontrado' });
  });

  it('deve responder com status 400 para BadRequestError', () => {
    const error = new BadRequestError('Parâmetro ausente');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: 'Parâmetro ausente' });
  });

  it('deve responder com status 400 para ZodError', () => {
    const schema = z.object({ email: z.string().email() });
    const parseResult = schema.safeParse({ email: 'invalido' });

    if (parseResult.success) {
      throw new Error('Falha ao gerar ZodError');
    }

    errorHandler(parseResult.error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: parseResult.error.message });
  });

  it('deve responder com status 500 genérico para erros desconhecidos', () => {
    const error = new Error('Falha catastrófica de conexão');

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
  });

  it('deve responder com status 409 quando ocorrer erro 23505 (violação de unicidade do PostgreSQL)', () => {
    const pgError = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
    });

    errorHandler(pgError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Registro duplicado ou já existente.',
    });
  });

  it('deve responder com status 409 quando ocorrer erro 23503 (violação de chave estrangeira do PostgreSQL)', () => {
    const pgError = Object.assign(new Error('update or delete on table violates foreign key constraint'), {
      code: '23503',
    });

    errorHandler(pgError, req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Operação não permitida: registro vinculado a outros dados.',
    });
  });
});

