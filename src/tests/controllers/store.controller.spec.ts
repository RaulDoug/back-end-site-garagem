import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import StoreController from '#controllers/store.controller.js';

describe('StoreController', () => {
  const mockStoreService = {
    create: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    delete: vi.fn(),
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

      await storeController.create(req, res);

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

      mockStoreService.create.mockRejectedValue(new Error('CNPJ já cadastrado'));

      await storeController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ message: 'CNPJ já cadastrado' });
    });

    it('deve retornar 400 em caso de erro de validação Zod', async () => {
      const req = mockRequest({});
      const res = mockResponse();

      mockStoreService.create.mockRejectedValue(new ZodError([]));

      await storeController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('deve retornar 500 em erro interno inesperado', async () => {
      const req = mockRequest(storeBody);
      const res = mockResponse();

      mockStoreService.create.mockRejectedValue(new Error('Erro no banco'));

      await storeController.create(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
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

      await storeController.findById(req, res);

      expect(mockStoreService.findById).toHaveBeenCalledWith('store-uuid-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: store });
    });

    it('deve retornar 404 quando a loja não for encontrada', async () => {
      const req = mockRequest({}, { id: 'uuid-inexistente' });
      const res = mockResponse();

      mockStoreService.findById.mockResolvedValue(null);

      await storeController.findById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registro não encontrado' });
    });

    it('deve retornar 500 em caso de erro interno', async () => {
      const req = mockRequest({}, { id: 'store-uuid-1' });
      const res = mockResponse();

      mockStoreService.findById.mockRejectedValue(new Error('Falha no banco'));

      await storeController.findById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
    });
  });

  describe('find', () => {
    it('deve retornar 200 com a lista de lojas', async () => {
      const req = mockRequest({}, {}, { is_active: 'true' });
      const res = mockResponse();

      const storesList = [{ id: 'store-uuid-1', name: 'Loja 1' }];
      mockStoreService.find.mockResolvedValue(storesList);

      await storeController.find(req, res);

      expect(mockStoreService.find).toHaveBeenCalledWith(req.query);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: storesList });
    });

    it('deve retornar 500 em caso de erro interno na listagem', async () => {
      const req = mockRequest();
      const res = mockResponse();

      mockStoreService.find.mockRejectedValue(new Error('Falha ao listar'));

      await storeController.find(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Erro interno do servidor' });
    });
  });

  describe('delete', () => {
    it('deve retornar 200 com os dados da loja deletada', async () => {
      const req = mockRequest({}, { id: 'store-uuid-1' });
      const res = mockResponse();

      const deletedStore = { id: 'store-uuid-1', name: 'Loja Deletada' };
      mockStoreService.delete.mockResolvedValue(deletedStore);

      await storeController.delete(req, res);

      expect(mockStoreService.delete).toHaveBeenCalledWith('store-uuid-1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ result: deletedStore });
    });

    it('deve retornar 404 quando o registro para deleção não existir', async () => {
      const req = mockRequest({}, { id: 'uuid-inexistente' });
      const res = mockResponse();

      mockStoreService.delete.mockResolvedValue(null);

      await storeController.delete(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Registro não encontrado' });
    });
  });
});
