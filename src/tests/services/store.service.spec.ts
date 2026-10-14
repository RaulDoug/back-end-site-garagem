import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreService from '#services/store.service.js';
import type { Store } from '#repositories/store.repository.js';
import type { CreateStoreInput, UpdateStoreBody } from '#schemas/store.schema.js';

describe('StoreService', () => {
  const mockStoreRepository = {
    findCnpj: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    find: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  };

  let storeService: StoreService;

  beforeEach(() => {
    vi.clearAllMocks();
    storeService = new StoreService(mockStoreRepository as any); // eslint-disable-line
  });

  describe('create', () => {
    const validStoreInput: CreateStoreInput = {
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

    it('deve formatar o endereço e criar a loja quando os dados forem válidos', async () => {
      mockStoreRepository.findCnpj.mockResolvedValue(null);

      const createdStore: Store = {
        id: 'store-uuid-123',
        name: validStoreInput.name,
        phone: validStoreInput.phone,
        cnpj: validStoreInput.cnpj,
        address: 'Avenida Brasil, 100 - Centro, Divinópolis/MG',
        is_active: true,
        created_at: new Date(),
      };

      mockStoreRepository.create.mockResolvedValue(createdStore);

      const result = await storeService.create(validStoreInput);

      expect(mockStoreRepository.findCnpj).toHaveBeenCalledWith(validStoreInput.cnpj);
      expect(mockStoreRepository.create).toHaveBeenCalledWith({
        name: validStoreInput.name,
        phone: validStoreInput.phone,
        cnpj: validStoreInput.cnpj,
        address: 'Avenida Brasil, 100 - Centro, Divinópolis/MG',
      });
      expect(result).toEqual(createdStore);
    });

    it('deve lançar erro se o CNPJ já estiver cadastrado', async () => {
      mockStoreRepository.findCnpj.mockResolvedValue({ cnpj: validStoreInput.cnpj });

      await expect(storeService.create(validStoreInput)).rejects.toThrow('CNPJ já cadastrado');
      expect(mockStoreRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('deve retornar os dados da loja quando o ID existir', async () => {
      const mockStore: Store = {
        id: 'store-uuid-123',
        name: 'Garagem Veículos',
        phone: '(37) 99999-9999',
        cnpj: '00.000.000/0001-91',
        address: 'Rua Principal, 10',
        is_active: true,
        created_at: new Date(),
      };

      mockStoreRepository.findById.mockResolvedValue(mockStore);

      const result = await storeService.findById('store-uuid-123');

      expect(mockStoreRepository.findById).toHaveBeenCalledWith('store-uuid-123');
      expect(result).toEqual(mockStore);
    });

    it('deve retornar null se a loja não for encontrada', async () => {
      mockStoreRepository.findById.mockResolvedValue(null);

      const result = await storeService.findById('uuid-inexistente');

      expect(result).toBeNull();
    });
  });

  describe('find', () => {
    it('deve listar as lojas conforme o filtro fornecido', async () => {
      const mockList: Store[] = [
        {
          id: 'store-1',
          name: 'Loja 1',
          phone: '(37) 99999-1111',
          cnpj: '00.000.000/0001-91',
          address: 'Rua 1, 10',
          is_active: true,
          created_at: new Date(),
        },
      ];

      mockStoreRepository.find.mockResolvedValue(mockList);

      const result = await storeService.find({ is_active: true });

      expect(mockStoreRepository.find).toHaveBeenCalledWith({ is_active: true });
      expect(result).toEqual(mockList);
    });
  });

  describe('delete', () => {
    it('deve deletar e retornar a loja deletada pelo ID', async () => {
      const deletedStore: Store = {
        id: 'store-uuid-123',
        name: 'Loja 1',
        phone: '(37) 99999-1111',
        cnpj: '00.000.000/0001-91',
        address: 'Rua 1, 10',
        is_active: false,
        created_at: new Date(),
      };

      mockStoreRepository.delete.mockResolvedValue(deletedStore);

      const result = await storeService.delete('store-uuid-123');

      expect(mockStoreRepository.delete).toHaveBeenCalledWith('store-uuid-123');
      expect(result).toEqual(deletedStore);
    });
  });

  describe('update', () => {
    const existingStore: Store = {
      id: 'store-uuid-123',
      name: 'Garagem Veículos',
      phone: '(37) 99999-9999',
      cnpj: '00.000.000/0001-91',
      address: 'Avenida Brasil, 100 - Centro, Divinópolis/MG',
      is_active: true,
      created_at: new Date(),
    };

    it('deve atualizar parcialmente os dados quando houver alterações válidas', async () => {
      mockStoreRepository.findById.mockResolvedValue(existingStore);
      const updatedStore: Store = { ...existingStore, name: 'Garagem Nova' };
      mockStoreRepository.update.mockResolvedValue(updatedStore);

      const updateInput: UpdateStoreBody = { name: 'Garagem Nova' };
      const result = await storeService.update('store-uuid-123', updateInput);

      expect(mockStoreRepository.findById).toHaveBeenCalledWith('store-uuid-123');
      expect(mockStoreRepository.update).toHaveBeenCalledWith('store-uuid-123', { name: 'Garagem Nova' });
      expect(result).toEqual(updatedStore);
    });

    it('deve formatar o endereço e atualizar quando um novo endereço for informado', async () => {
      mockStoreRepository.findById.mockResolvedValue(existingStore);
      const newAddress = {
        street: 'Rua Paraná',
        number: 50,
        neighborhood: 'Porto Velho',
        city: 'Divinópolis',
        state: 'MG',
        zip_code: '35500-111',
      };
      const formattedAddress = 'Rua Paraná, 50 - Porto Velho, Divinópolis/MG';
      const updatedStore: Store = { ...existingStore, address: formattedAddress };
      mockStoreRepository.update.mockResolvedValue(updatedStore);

      const result = await storeService.update('store-uuid-123', { address: newAddress });

      expect(mockStoreRepository.update).toHaveBeenCalledWith('store-uuid-123', { address: formattedAddress });
      expect(result).toEqual(updatedStore);
    });

    it('deve retornar a loja existente sem chamar o update se nenhum campo for alterado (idempotência)', async () => {
      mockStoreRepository.findById.mockResolvedValue(existingStore);

      const result = await storeService.update('store-uuid-123', { name: existingStore.name });

      expect(mockStoreRepository.findById).toHaveBeenCalledWith('store-uuid-123');
      expect(mockStoreRepository.update).not.toHaveBeenCalled();
      expect(result).toEqual(existingStore);
    });

    it('deve lançar erro se a loja não for localizada', async () => {
      mockStoreRepository.findById.mockResolvedValue(null);

      await expect(storeService.update('uuid-inexistente', { name: 'Loja' })).rejects.toThrow(
        'Nenhum cadastro de loja localizado para o ID informado',
      );
      expect(mockStoreRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar erro se tentar atualizar para um CNPJ já cadastrado', async () => {
      mockStoreRepository.findById.mockResolvedValue(existingStore);
      mockStoreRepository.findCnpj.mockResolvedValue({ cnpj: '11.111.111/0001-11' });

      await expect(
        storeService.update('store-uuid-123', { cnpj: '11.111.111/0001-11' }),
      ).rejects.toThrow('CNPJ já cadastrado');
      expect(mockStoreRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar erro se o repositório retornar null na atualização', async () => {
      mockStoreRepository.findById.mockResolvedValue(existingStore);
      mockStoreRepository.update.mockResolvedValue(null);

      await expect(storeService.update('store-uuid-123', { name: 'Garagem Nova' })).rejects.toThrow(
        'Falha ao atualizar o cadastro',
      );
    });
  });
});
