import { describe, it, expect, vi, beforeEach } from 'vitest';
import StoreService from '#services/store.service.js';
import { StoreRepository, type Store } from '#repositories/store.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

const mockStore: Store = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Loja Exemplo',
  phone: '(37) 98888-7777',
  cnpj: '12345678000195',
  zip_code: '35500000',
  street: 'Rua Central',
  number: '100',
  neighborhood: 'Centro',
  city: 'Divinópolis',
  state: 'MG',
  complement: null,
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

const storePayload = {
  name: 'Loja Exemplo',
  phone: '(37) 98888-7777',
  cnpj: '12345678000195',
  zip_code: '35500000',
  street: 'Rua Central',
  number: '100',
  neighborhood: 'Centro',
  city: 'Divinópolis',
  state: 'MG',
};

describe('StoreService', () => {
  let storeRepository: StoreRepository;
  let storeService: StoreService;

  beforeEach(() => {
    vi.resetAllMocks();
    storeRepository = {
      findById: vi.fn(),
      findByCNPJ: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      find: vi.fn(),
    } as unknown as StoreRepository;

    storeService = new StoreService(storeRepository);
  });

  describe('create', () => {
    it('deve criar uma nova loja com sucesso quando o CNPJ for inédito', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(storeRepository.create).mockResolvedValue(mockStore);

      const result = await storeService.create(storePayload);

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith('12345678000195');
      expect(storeRepository.create).toHaveBeenCalledWith(storePayload);
      expect(result).toEqual(mockStore);
    });

    it('deve lançar AppError com status 409 se o CNPJ já estiver cadastrado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);

      await expect(
        storeService.create({
          ...storePayload,
          name: 'Loja Clonada',
        })
      ).rejects.toThrow(new AppError('CNPJ já cadastrado', 409));

      expect(storeRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('deve retornar a loja quando o ID existir', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(mockStore);

      const result = await storeService.findById(mockStore.id);

      expect(storeRepository.findById).toHaveBeenCalledWith(mockStore.id);
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) quando o ID não for encontrado', async () => {
      vi.mocked(storeRepository.findById).mockResolvedValue(null);

      await expect(storeService.findById('id-inexistente')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('findByCNPJ', () => {
    it('deve retornar a loja quando o CNPJ for encontrado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);

      const result = await storeService.findByCNPJ(mockStore.cnpj);

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith(mockStore.cnpj);
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) quando o CNPJ não for encontrado', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);

      await expect(storeService.findByCNPJ('99999999000199')).rejects.toThrow(
        NotFoundError
      );
    });
  });

  describe('update', () => {
    it('deve atualizar dados da loja sem alterar CNPJ', async () => {
      const updatedStore = { ...mockStore, name: 'Novo Nome' };
      vi.mocked(storeRepository.update).mockResolvedValue(updatedStore);

      const result = await storeService.update(mockStore.id, {
        name: 'Novo Nome',
      });

      expect(storeRepository.findByCNPJ).not.toHaveBeenCalled();
      expect(storeRepository.update).toHaveBeenCalledWith(mockStore.id, {
        name: 'Novo Nome',
      });
      expect(result).toEqual(updatedStore);
    });

    it('deve permitir atualizar CNPJ quando o novo CNPJ não estiver em uso', async () => {
      const newCnpj = '98765432000110';
      const updatedStore = { ...mockStore, cnpj: newCnpj };

      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(null);
      vi.mocked(storeRepository.update).mockResolvedValue(updatedStore);

      const result = await storeService.update(mockStore.id, { cnpj: newCnpj });

      expect(storeRepository.findByCNPJ).toHaveBeenCalledWith(newCnpj);
      expect(storeRepository.update).toHaveBeenCalledWith(mockStore.id, { cnpj: newCnpj });
      expect(result).toEqual(updatedStore);
    });

    it('deve permitir atualizar mantendo o mesmo CNPJ da própria loja', async () => {
      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(mockStore);
      vi.mocked(storeRepository.update).mockResolvedValue(mockStore);

      const result = await storeService.update(mockStore.id, { cnpj: mockStore.cnpj });

      expect(storeRepository.update).toHaveBeenCalledWith(mockStore.id, { cnpj: mockStore.cnpj });
      expect(result).toEqual(mockStore);
    });

    it('deve lançar AppError (409) se o novo CNPJ pertencer a outra loja', async () => {
      const otherStore: Store = {
        ...mockStore,
        id: 'outra-loja-uuid',
        cnpj: '98765432000110',
      };

      vi.mocked(storeRepository.findByCNPJ).mockResolvedValue(otherStore);

      await expect(
        storeService.update(mockStore.id, { cnpj: otherStore.cnpj })
      ).rejects.toThrow(new AppError('CNPJ já em uso por outra loja', 409));

      expect(storeRepository.update).not.toHaveBeenCalled();
    });

    it('deve lançar NotFoundError (404) se a loja a ser atualizada não existir', async () => {
      vi.mocked(storeRepository.update).mockResolvedValue(null);

      await expect(
        storeService.update('id-inexistente', { name: 'Loja' })
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('deve remover a loja com sucesso', async () => {
      vi.mocked(storeRepository.delete).mockResolvedValue(mockStore);

      const result = await storeService.delete(mockStore.id);

      expect(storeRepository.delete).toHaveBeenCalledWith(mockStore.id);
      expect(result).toEqual(mockStore);
    });

    it('deve lançar NotFoundError (404) ao tentar deletar loja inexistente', async () => {
      vi.mocked(storeRepository.delete).mockResolvedValue(null);

      await expect(storeService.delete('id-inexistente')).rejects.toThrow(
        NotFoundError
      );
    });
  });
});
