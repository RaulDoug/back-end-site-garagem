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
  find: Mock;
  update: Mock;
  delete: Mock;
};

const createMockUserService = (): MockUserService => ({
  create: vi.fn(),
  login: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
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

    it('deve propagar erro quando o e-mail for duplicado', async () => {
      const req = createRequest({ body });
      const error = new Error('E-mail já cadastrado');
      userService.create.mockRejectedValue(error);

      await expect(controller.register(req, res)).rejects.toThrow(error);
    });

    it('deve propagar ZodError', async () => {
      const req = createRequest({ body });
      userService.create.mockRejectedValue(zodError);

      await expect(controller.register(req, res)).rejects.toThrow(zodError);
    });

    it('deve propagar erro genérico desconhecido', async () => {
      const req = createRequest({ body });
      const error = new Error('Falha inesperada no banco');
      userService.create.mockRejectedValue(error);

      await expect(controller.register(req, res)).rejects.toThrow(error);
    });
  });

  describe('login', () => {
    const body = {
      email: USER_EMAIL,
      password: 'SenhaForte123!',
    };

    const loginResult = {
      token: 'jwt-token-fake',
      user: safeUser,
    };

    it('deve retornar 200 com o token e o usuário autenticado', async () => {
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

    it('deve propagar erro quando as credenciais forem inválidas', async () => {
      const req = createRequest({ body });
      const error = new Error('Credenciais inválidas');
      userService.login.mockRejectedValue(error);

      await expect(controller.login(req, res)).rejects.toThrow(error);
    });

    it('deve propagar ZodError', async () => {
      const req = createRequest({ body });
      userService.login.mockRejectedValue(zodError);

      await expect(controller.login(req, res)).rejects.toThrow(zodError);
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

    it('deve propagar erro quando o usuário for inexistente', async () => {
      const error = new Error('Usuário inexistente.');
      userService.findById.mockRejectedValue(error);

      await expect(controller.findById(req, res)).rejects.toThrow(error);
    });

    it('deve propagar ZodError', async () => {
      userService.findById.mockRejectedValue(zodError);

      await expect(controller.findById(req, res)).rejects.toThrow(zodError);
    });
  });

  describe('find', () => {
    const user = {
      id: USER_ID,
      email: USER_EMAIL,
      role: 'ADMIN',
    };

    it.each([
      ['true', { filters: [], includeDeleted: true }],
      ['false', { filters: [] }],
      ['abc', { filters: [] }],
      ['', { filters: [] }],
      [undefined, { filters: [] }],
    ])(
      'deve interpretar include_deleted=%s gerando filtros %o',
      async (rawValue, expectedFilters) => {
        const query =
          rawValue === undefined ? {} : { include_deleted: rawValue };
        const req = createRequest({ query, user });
        userService.find.mockResolvedValue([safeUser]);

        await controller.find(req, res);

        expect(userService.find).toHaveBeenCalledWith(expectedFilters);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ users: [safeUser] });
      }
    );

    it('deve propagar erro desconhecido', async () => {
      const req = createRequest({ query: {}, user });
      const error = new Error('Falha na listagem');
      userService.find.mockRejectedValue(error);

      await expect(controller.find(req, res)).rejects.toThrow(error);
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

    it('deve propagar erro quando o usuário for inexistente', async () => {
      const error = new Error('Usuário inexistente.');
      userService.update.mockRejectedValue(error);

      await expect(controller.update(req, res)).rejects.toThrow(error);
    });

    it('deve propagar erro quando houver ausência de campos', async () => {
      const error = new Error('Nenhum campo informado para atualização.');
      userService.update.mockRejectedValue(error);

      await expect(controller.update(req, res)).rejects.toThrow(error);
    });

    it('deve propagar ZodError', async () => {
      userService.update.mockRejectedValue(zodError);

      await expect(controller.update(req, res)).rejects.toThrow(zodError);
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

    it('deve propagar erro quando o usuário for inexistente', async () => {
      const error = new Error('Usuário inexistente.');
      userService.delete.mockRejectedValue(error);

      await expect(controller.delete(req, res)).rejects.toThrow(error);
    });

    it('deve propagar erro desconhecido', async () => {
      const error = new Error('Falha inesperada ao deletar');
      userService.delete.mockRejectedValue(error);

      await expect(controller.delete(req, res)).rejects.toThrow(error);
    });
  });
});
