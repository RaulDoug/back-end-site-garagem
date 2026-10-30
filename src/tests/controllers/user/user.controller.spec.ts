import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { Request, Response } from 'express';
import { z } from 'zod';
import UserController from '#controllers/user.controller.js';
import type UserService from '#services/user.service.js';

const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const USER_EMAIL = 'raul.ferreira@garagem.com';

const safeUser = {
  id: USER_ID,
  name: 'Raul Ferreira',
  email: USER_EMAIL,
  phone: '(37) 99999-9999',
  role: 'VENDEDOR' as const,
  commission_rates: 7.5,
  is_active: true,
  deleted_at: null,
  created_at: new Date('2026-01-10T12:00:00.000Z'),
};

type MockUserService = {
  create: Mock;
  login: Mock;
  findById: Mock;
  findAll: Mock;
  update: Mock;
  delete: Mock;
};

const createMockUserService = (): MockUserService => ({
  create: vi.fn(),
  login: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

const createRequest = (overrides: Partial<Request> = {}) =>
  ({
    body: {},
    params: {},
    query: {},
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

const zodError = (() => {
  const result = z
    .string()
    .email('Formato de e-mail inválido')
    .safeParse('email-invalido');

  if (result.success) {
    throw new Error('Falha ao criar um ZodError para o teste');
  }

  return result.error;
})();

describe('UserController', () => {
  let userService: MockUserService;
  let controller: UserController;
  let res: Response;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});

    userService = createMockUserService();
    controller = new UserController(userService as unknown as UserService);
    res = createResponse();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('register', () => {
    const body = {
      name: 'Raul Ferreira',
      email: USER_EMAIL,
      password: 'SenhaForte123!',
      phone: '(37) 99999-9999',
    };

    it('deve retornar 201 com a mensagem e o usuário criado', async () => {
      const req = createRequest({ body });
      userService.create.mockResolvedValue(safeUser);

      await controller.register(req, res);

      expect(userService.create).toHaveBeenCalledWith(body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário criado com sucesso!',
        user: safeUser,
      });
    });

    it('deve mapear e-mail duplicado para 409', async () => {
      const req = createRequest({ body });
      userService.create.mockRejectedValue(
        new Error('E-mail já cadastrado')
      );

      await controller.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({
        message: 'E-mail já cadastrado',
      });
    });

    it('deve mapear ZodError para 400', async () => {
      const req = createRequest({ body });
      userService.create.mockRejectedValue(zodError);

      await controller.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: zodError.message });
    });

    it('deve retornar 500 genérico para erro desconhecido', async () => {
      const req = createRequest({ body });
      userService.create.mockRejectedValue(
        new Error('Falha inesperada no banco')
      );

      await controller.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erro interno do servidor',
      });
    });
  });

  describe('login', () => {
    const body = {
      email: USER_EMAIL,
      password: 'SenhaForte123!',
    };

    it('deve retornar 200 com o token e o usuário autenticado', async () => {
      const loginResult = { token: 'token-jwt', user: safeUser };
      const req = createRequest({ body });
      userService.login.mockResolvedValue(loginResult);

      await controller.login(req, res);

      expect(userService.login).toHaveBeenCalledWith(body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login realizado com sucesso!',
        userInfo: loginResult,
      });
    });

    it('deve mapear credenciais inválidas para 401', async () => {
      const req = createRequest({ body });
      userService.login.mockRejectedValue(
        new Error('Credenciais inválidas')
      );

      await controller.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Credenciais inválidas',
      });
    });

    it('deve mapear ZodError para 400', async () => {
      const req = createRequest({ body });
      userService.login.mockRejectedValue(zodError);

      await controller.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: zodError.message });
    });
  });

  describe('findById', () => {
    const req = createRequest({ params: { id: USER_ID } });

    it('deve retornar 200 com userInfo', async () => {
      userService.findById.mockResolvedValue(safeUser);

      await controller.findById(req, res);

      expect(userService.findById).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ userInfo: safeUser });
    });

    it('deve mapear usuário inexistente para 404', async () => {
      userService.findById.mockRejectedValue(
        new Error('Usuário inexistente.')
      );

      await controller.findById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário inexistente.',
      });
    });

    it('deve mapear ZodError para 400', async () => {
      userService.findById.mockRejectedValue(zodError);

      await controller.findById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: zodError.message });
    });
  });

  describe('findAll', () => {
    const user = {
      id: USER_ID,
      email: USER_EMAIL,
      role: 'ADMIN',
    };

    it.each([
      ['true', true],
      ['false', false],
      ['abc', false],
      ['', false],
      [undefined, false],
    ])(
      'deve interpretar include_deleted=%s como %s',
      async (rawValue, expected) => {
        const query =
          rawValue === undefined ? {} : { include_deleted: rawValue };
        const req = createRequest({ query, user });
        userService.findAll.mockResolvedValue([safeUser]);

        await controller.findAll(req, res);

        expect(userService.findAll).toHaveBeenCalledWith(expected, 'ADMIN');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ users: [safeUser] });
      }
    );

    it('deve usar VENDEDOR como role padrão quando req.user não existir', async () => {
      const req = createRequest({ query: { include_deleted: 'true' } });
      userService.findAll.mockResolvedValue([]);

      await controller.findAll(req, res);

      expect(userService.findAll).toHaveBeenCalledWith(true, 'VENDEDOR');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ users: [] });
    });

    it('deve retornar 500 genérico para erro desconhecido', async () => {
      const req = createRequest({ query: {}, user });
      userService.findAll.mockRejectedValue(new Error('Falha na listagem'));

      await controller.findAll(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erro interno do servidor',
      });
    });
  });

  describe('update', () => {
    const body = { name: 'Renato Alves' };
    const updatedUser = { ...safeUser, name: 'Renato Alves' };
    const req = createRequest({
      params: { id: USER_ID },
      body,
    });

    it('deve retornar 200 com a mensagem e o usuário atualizado', async () => {
      userService.update.mockResolvedValue(updatedUser);

      await controller.update(req, res);

      expect(userService.update).toHaveBeenCalledWith(USER_ID, body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário atualizado com sucesso!',
        userInfo: updatedUser,
      });
    });

    it('deve mapear usuário inexistente para 404', async () => {
      userService.update.mockRejectedValue(
        new Error('Usuário inexistente.')
      );

      await controller.update(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário inexistente.',
      });
    });

    it('deve mapear ausência de campos para 400', async () => {
      userService.update.mockRejectedValue(
        new Error('Nenhum campo informado para atualização.')
      );

      await controller.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Nenhum campo informado para atualização.',
      });
    });

    it('deve mapear ZodError para 400', async () => {
      userService.update.mockRejectedValue(zodError);

      await controller.update(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: zodError.message });
    });
  });

  describe('delete', () => {
    const req = createRequest({ params: { id: USER_ID } });
    const deletedUser = { ...safeUser, is_active: false };

    it('deve retornar 200 com a mensagem e o usuário deletado', async () => {
      userService.delete.mockResolvedValue(deletedUser);

      await controller.delete(req, res);

      expect(userService.delete).toHaveBeenCalledWith(USER_ID);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário deletado com sucesso!',
        userInfo: deletedUser,
      });
    });

    it('deve mapear usuário inexistente para 404', async () => {
      userService.delete.mockRejectedValue(
        new Error('Usuário inexistente.')
      );

      await controller.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário inexistente.',
      });
    });

    it('deve retornar 500 genérico para erro desconhecido', async () => {
      userService.delete.mockRejectedValue(
        new Error('Falha inesperada ao deletar')
      );

      await controller.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Erro interno do servidor',
      });
    });
  });
});
