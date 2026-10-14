import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import UserController from '#controllers/user.controller.js';

describe('UserController', () => {
  const mockUserService = {
    create: vi.fn(),
    login: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    delete: vi.fn(),
  };

  let userController: UserController;

  const mockResponse = () => {
    const res = {} as unknown as Response;
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  const mockRequest = (body = {}, params = {}, query = {}) => {
    return {
      body,
      params,
      query,
    } as unknown as Request;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    userController = new UserController(mockUserService as any); // eslint-disable-line
  });

  describe('register', () => {
    it('deve retornar 201 e dados do usuário quando cadastrado com sucesso', async () => {
      const req = mockRequest({
        name: 'Raul',
        email: 'raul@teste.com',
        password: 'password123',
        phone: '(37) 99999-9999',
      });
      const res = mockResponse();

      const createdUser = {
        id: 'user-uuid-1',
        name: 'Raul',
        email: 'raul@teste.com',
        phone: '(37) 99999-9999',
        role: 'VENDEDOR',
      };
      mockUserService.create.mockResolvedValue(createdUser);

      await userController.register(req, res);

      expect(mockUserService.create).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Usuário criado com sucesso!',
        user: createdUser,
      });
    });

    it('deve retornar 409 quando o e-mail já estiver cadastrado', async () => {
      const req = mockRequest({ email: 'duplicado@teste.com' });
      const res = mockResponse();

      mockUserService.create.mockRejectedValue(new Error('E-mail já cadastrado'));

      await userController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'E-mail já cadastrado' });
    });

    it('deve retornar 400 quando ocorrer erro de validação Zod', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      mockUserService.create.mockRejectedValue(new ZodError([]));

      await userController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deve retornar 500 em erro interno inesperado', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      mockUserService.create.mockRejectedValue(new Error('Falha no banco'));

      await userController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
    });
  });

  describe('login', () => {
    it('deve retornar 200 e informações de login com token', async () => {
      const req = mockRequest({ email: 'raul@teste.com', password: 'password123' });
      const res = mockResponse();

      const loginResult = {
        token: 'mock-jwt-token',
        user: { id: 'user-uuid-1', name: 'Raul', email: 'raul@teste.com' },
      };
      mockUserService.login.mockResolvedValue(loginResult);

      await userController.login(req, res);

      expect(mockUserService.login).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Login realizado com sucesso!',
        userInfo: loginResult,
      });
    });

    it('deve retornar 401 quando as credenciais forem inválidas', async () => {
      const req = mockRequest({ email: 'raul@teste.com', password: 'wrong' });
      const res = mockResponse();

      mockUserService.login.mockRejectedValue(new Error('Credenciais inválidas'));

      await userController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: 'Credenciais inválidas' });
    });

    it('deve retornar 500 em caso de erro interno', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      mockUserService.login.mockRejectedValue(new Error('Falha no servidor'));

      await userController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
    });
  });

  describe('findById', () => {
    it('deve retornar 200 com os dados do usuário sem o hash de senha', async () => {
      const req = mockRequest({}, { id: 'user-uuid-1' });
      const res = mockResponse();

      const userInDb = {
        id: 'user-uuid-1',
        name: 'Raul',
        email: 'raul@teste.com',
        password_hash: 'senha_secreta_hash',
        role: 'ADMIN',
      };
      mockUserService.findById.mockResolvedValue(userInDb);

      await userController.findById(req, res);

      expect(mockUserService.findById).toHaveBeenCalledWith('user-uuid-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        userInfo: {
          id: 'user-uuid-1',
          name: 'Raul',
          email: 'raul@teste.com',
          role: 'ADMIN',
        },
      });
    });

    it('deve retornar 404 quando o usuário não for encontrado', async () => {
      const req = mockRequest({}, { id: 'uuid-inexistente' });
      const res = mockResponse();

      mockUserService.findById.mockResolvedValue(null);

      await userController.findById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registro não encontrado' });
    });

    it('deve retornar 500 em erro interno', async () => {
      const req = mockRequest({}, { id: 'user-uuid-1' });
      const res = mockResponse();

      mockUserService.findById.mockRejectedValue(new Error('Falha de conexão'));

      await userController.findById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
    });
  });

  describe('delete', () => {
    it('deve retornar 200 com o registro deletado', async () => {
      const req = mockRequest({}, { id: 'user-uuid-1' });
      const res = mockResponse();

      const deletedUser = { id: 'user-uuid-1', name: 'Raul' };
      mockUserService.delete.mockResolvedValue(deletedUser);

      await userController.delete(req, res);

      expect(mockUserService.delete).toHaveBeenCalledWith('user-uuid-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: deletedUser });
    });

    it('deve retornar 404 quando o registro para deleção não existir', async () => {
      const req = mockRequest({}, { id: 'uuid-inexistente' });
      const res = mockResponse();

      mockUserService.delete.mockResolvedValue(null);

      await userController.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registro não encontrado' });
    });
  });
});
