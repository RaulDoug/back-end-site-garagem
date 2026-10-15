import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import StoreController from '#controllers/store.controller.js';
import AppError from '#src/errors/AppError.js';

describe('StoreController', () => {
  const mockStoreService = {
    create: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  };

  let storeController: StoreController;

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

  const next = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    storeController = new StoreController(mockStoreService as any); // eslint-disable-line
  });

  describe('create', () => {
    const storeBody = {
      name: 'Garagem Veículos',
      phone: '(37) 99999-9999',
      cnpj: '00.000.000/0001-91',
      address: {
        street: 'Avenida Brasil',
        number: 100,
        neighborhood: 'Centro',
        city: 'Divinópolis',
        state: 'MG',
        zip_code: '35500-000',
      },
    };

    it('deve retornar 201 e a loja criada quando os dados forem válidos', async () => {
      const req = mockRequest(storeBody);
      const res = mockResponse();

      const createdStore = {
        id: 'store-uuid-1',
        name: storeBody.name,
        phone: storeBody.phone,
        cnpj: storeBody.cnpj,
        address: 'Avenida Brasil, 100 - Centro, Divinópolis/MG',
        is_active: true,
        created_at: new Date(),
      };

      mockStoreService.create.mockResolvedValue(createdStore);

      await storeController.create(req, res, next);

      expect(mockStoreService.create).toHaveBeenCalledWith(req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Loja cadastrada com sucesso!',
        store: createdStore,
      });
    });

    it('deve retornar 409 quando o CNPJ já estiver cadastrado', async () => {
      const req = mockRequest(storeBody);
      const res = mockResponse();
      const error = new AppError('CNPJ já cadastrado', 409);

      mockStoreService.create.mockRejectedValue(error);

      await storeController.create(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve retornar 400 em caso de erro de validação Zod', async () => {
      const req = mockRequest({});
      const res = mockResponse();
      const zodError = new ZodError([]);

      mockStoreService.create.mockRejectedValue(zodError);

      await storeController.create(req, res, next);

      expect(next).toHaveBeenCalledWith(zodError);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve retornar 500 em erro interno inesperado', async () => {
      const req = mockRequest(storeBody);
      const res = mockResponse();
      const error = new AppError('Erro no banco', 500);

      mockStoreService.create.mockRejectedValue(error);

      await storeController.create(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('deve retornar 200 e os dados da loja quando o ID existir', async () => {
      const req = mockRequest({}, { id: 'store-uuid-1' });
      const res = mockResponse();

      const store = {
        id: 'store-uuid-1',
        name: 'Loja Teste',
        cnpj: '00.000.000/0001-91',
      };
      mockStoreService.findById.mockResolvedValue(store);

      await storeController.findById(req, res, next);

      expect(mockStoreService.findById).toHaveBeenCalledWith('store-uuid-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: store });
    });

    it('deve retornar 404 quando a loja não for encontrada', async () => {
      const req = mockRequest({}, { id: 'uuid-inexistente' });
      const res = mockResponse();

      mockStoreService.findById.mockResolvedValue(null);

      await storeController.findById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registro não encontrado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 500 em caso de erro interno', async () => {
      const req = mockRequest({}, { id: 'store-uuid-1' });
      const res = mockResponse();
      const error = new AppError('Erro interno do servidor', 500);

      mockStoreService.findById.mockRejectedValue(error);

      await storeController.findById(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('find', () => {
    it('deve retornar 200 com a lista de lojas', async () => {
      const req = mockRequest({}, {}, { is_active: 'true' });
      const res = mockResponse();

      const storesList = [{ id: 'store-uuid-1', name: 'Loja 1' }];
      mockStoreService.find.mockResolvedValue(storesList);

      await storeController.find(req, res, next);

      expect(mockStoreService.find).toHaveBeenCalledWith(req.query);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: storesList });
    });

    it('deve retornar 200 com array vazio quando nenhuma loja for encontrada', async () => {
      const req = mockRequest({}, {}, { name: 'Inexistente' });
      const res = mockResponse();

      mockStoreService.find.mockResolvedValue([]);

      await storeController.find(req, res, next);

      expect(mockStoreService.find).toHaveBeenCalledWith(req.query);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: [] });
    });

    it('deve retornar 500 em caso de erro interno na listagem', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const error = new AppError('Erro interno do servidor', 500);

      mockStoreService.find.mockRejectedValue(error);

      await storeController.find(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deve retornar 200 com os dados da loja deletada', async () => {
      const req = mockRequest({}, { id: 'store-uuid-1' });
      const res = mockResponse();

      const deletedStore = { id: 'store-uuid-1', name: 'Loja Deletada' };
      mockStoreService.delete.mockResolvedValue(deletedStore);

      await storeController.delete(req, res, next);

      expect(mockStoreService.delete).toHaveBeenCalledWith('store-uuid-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: deletedStore });
    });

    it('deve retornar 404 quando o registro para deleção não existir', async () => {
      const req = mockRequest({}, { id: 'uuid-inexistente' });
      const res = mockResponse();

      mockStoreService.delete.mockResolvedValue(null);

      await storeController.delete(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registro não encontrado' });
      expect(next).not.toHaveBeenCalled();
    });

    it('deve retornar 500 em caso de erro interno na deleção', async () => {
      const req = mockRequest({}, { id: 'store-uuid-1' });
      const res = mockResponse();
      const error = new AppError('Falha no banco ao deletar', 500);

      mockStoreService.delete.mockRejectedValue(error);

      await storeController.delete(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    const updateBody = {
      name: 'Garagem Veículos Atualizada',
      phone: '(37) 98888-8888',
    };

    it('deve retornar 200 e a loja atualizada quando os dados forem válidos', async () => {
      const req = mockRequest(updateBody, { id: 'store-uuid-1' });
      const res = mockResponse();

      const updatedStore = {
        id: 'store-uuid-1',
        name: updateBody.name,
        phone: updateBody.phone,
        cnpj: '00.000.000/0001-91',
        address: 'Avenida Brasil, 100 - Centro, Divinópolis/MG',
        is_active: true,
        created_at: new Date(),
      };

      mockStoreService.update.mockResolvedValue({ updated: true, store: updatedStore });

      await storeController.update(req, res, next);

      expect(mockStoreService.update).toHaveBeenCalledWith('store-uuid-1', req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Loja atualizada com sucesso!',
        store: updatedStore,
      });
    });

    it('deve retornar 200 com mensagem de nenhuma alteração quando os dados forem idênticos', async () => {
      const req = mockRequest(updateBody, { id: 'store-uuid-1' });
      const res = mockResponse();

      const existingStore = {
        id: 'store-uuid-1',
        name: updateBody.name,
        phone: updateBody.phone,
        cnpj: '00.000.000/0001-91',
        address: 'Avenida Brasil, 100 - Centro, Divinópolis/MG',
        is_active: true,
        created_at: new Date(),
      };

      mockStoreService.update.mockResolvedValue({ updated: false, store: existingStore });

      await storeController.update(req, res, next);

      expect(mockStoreService.update).toHaveBeenCalledWith('store-uuid-1', req.body);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Nenhuma informação atualizada',
        store: existingStore,
      });
    });

    it('deve retornar 404 quando a loja não for encontrada para atualização', async () => {
      const req = mockRequest(updateBody, { id: 'uuid-inexistente' });
      const res = mockResponse();
      const error = new AppError('Nenhum cadastro de loja localizado para o ID informado', 404);

      mockStoreService.update.mockRejectedValue(error);

      await storeController.update(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve retornar 409 quando o novo CNPJ já estiver cadastrado', async () => {
      const req = mockRequest({ cnpj: '11.111.111/0001-11' }, { id: 'store-uuid-1' });
      const res = mockResponse();
      const error = new AppError('CNPJ já cadastrado', 409);

      mockStoreService.update.mockRejectedValue(error);

      await storeController.update(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve retornar 400 em caso de erro de validação Zod', async () => {
      const req = mockRequest({ phone: 'formato-invalido' }, { id: 'store-uuid-1' });
      const res = mockResponse();
      const zodError = new ZodError([]);

      mockStoreService.update.mockRejectedValue(zodError);

      await storeController.update(req, res, next);

      expect(next).toHaveBeenCalledWith(zodError);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('deve retornar 500 em erro interno inesperado na atualização', async () => {
      const req = mockRequest(updateBody, { id: 'store-uuid-1' });
      const res = mockResponse();
      const error = new AppError('Erro no banco', 500);

      mockStoreService.update.mockRejectedValue(error);

      await storeController.update(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
