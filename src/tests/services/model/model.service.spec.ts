import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelService from '#services/model.service.js';
import { ModelRepository, type Model } from '#repositories/model.repository.js';
import { BrandRepository, type Brand } from '#repositories/brand.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

const mockBrand: Brand = {
  id: '3a8d1c2b-7a61-4e59-9b0a-2c3d4e5f6a7b',
  tenant_id: 'tenant-1',
  name: 'Toyota',
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

const mockModel: Model = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  tenant_id: 'tenant-1',
  brand_id: mockBrand.id,
  name: 'Corolla',
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

describe('ModelService', () => {
  let modelRepository: ModelRepository;
  let brandRepository: BrandRepository;
  let modelService: ModelService;

  beforeEach(() => {
    vi.resetAllMocks();
    modelRepository = {
      findById: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findByNameAndBrand: vi.fn(),
      findByBrandId: vi.fn(),
    } as unknown as ModelRepository;

    brandRepository = {
      findByIdForTenant: vi.fn(),
    } as unknown as BrandRepository;

    modelService = new ModelService(modelRepository, brandRepository);
  });

  describe('findById', () => {
    it('deve retornar o modelo quando encontrado no tenant', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(mockModel);

      const result = await modelService.findById(mockModel.id, 'tenant-1');

      expect(modelRepository.findById).toHaveBeenCalledWith(mockModel.id, 'tenant-1');
      expect(result).toEqual(mockModel);
    });

    it('deve lançar NotFoundError se o modelo não existir no tenant', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(null);

      await expect(modelService.findById('uuid-inexistente', 'tenant-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('find', () => {
    it('deve retornar lista de modelos filtrados pelo tenant', async () => {
      vi.mocked(modelRepository.find).mockResolvedValue([mockModel]);

      const filters = { filters: [] };
      const result = await modelService.find(filters, 'tenant-1');

      expect(modelRepository.find).toHaveBeenCalledWith(filters, 'tenant-1');
      expect(result).toEqual([mockModel]);
    });
  });

  describe('create', () => {
    it('deve criar um modelo com sucesso para o tenant', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockBrand);
      vi.mocked(modelRepository.findByNameAndBrand).mockResolvedValue(null);
      vi.mocked(modelRepository.create).mockResolvedValue(mockModel);

      const payload = { brand_id: mockModel.brand_id, name: 'Corolla' };
      const result = await modelService.create(payload, 'tenant-1');

      expect(brandRepository.findByIdForTenant).toHaveBeenCalledWith(mockModel.brand_id, 'tenant-1');
      expect(modelRepository.findByNameAndBrand).toHaveBeenCalledWith('Corolla', mockModel.brand_id, 'tenant-1');
      expect(modelRepository.create).toHaveBeenCalledWith({
        tenant_id: 'tenant-1',
        brand_id: mockModel.brand_id,
        name: 'Corolla',
      });
      expect(result).toEqual(mockModel);
    });

    it('deve lançar NotFoundError se a marca não existir para o tenant', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(
        modelService.create({ brand_id: '3a8d1c2b-7a61-4e59-9b0a-2c3d4e5f6a70', name: 'Corolla' }, 'tenant-1')
      ).rejects.toThrow(new NotFoundError('Marca informada não encontrada'));
    });

    it('deve lançar conflito 409 se modelo com mesmo nome já existir para a marca no tenant', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockBrand);
      vi.mocked(modelRepository.findByNameAndBrand).mockResolvedValue(mockModel);

      await expect(
        modelService.create({ brand_id: mockModel.brand_id, name: 'Corolla' }, 'tenant-1')
      ).rejects.toThrow(new AppError('Modelo já cadastrado para esta marca', 409));
    });
  });

  describe('update', () => {
    it('deve atualizar o modelo com sucesso', async () => {
      const updatedModel = { ...mockModel, name: 'Corolla GLi' };
      vi.mocked(modelRepository.findById).mockResolvedValue(mockModel);
      vi.mocked(modelRepository.findByNameAndBrand).mockResolvedValue(null);
      vi.mocked(modelRepository.update).mockResolvedValue(updatedModel);

      const result = await modelService.update(mockModel.id, { name: 'Corolla GLi' }, 'tenant-1');

      expect(modelRepository.update).toHaveBeenCalledWith(mockModel.id, { name: 'Corolla GLi' }, 'tenant-1');
      expect(result).toEqual(updatedModel);
    });

    it('deve lançar NotFoundError ao tentar atualizar modelo inexistente no tenant', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(null);

      await expect(modelService.update('id-inexistente', { name: 'Novo' }, 'tenant-1')).rejects.toThrow(NotFoundError);
    });

    it('deve lançar NotFoundError ao atualizar para uma marca inacessível ao tenant', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(mockModel);
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(
        modelService.update(mockModel.id, { brand_id: '3a8d1c2b-7a61-4e59-9b0a-2c3d4e5f6a70' }, 'tenant-1')
      ).rejects.toThrow(new NotFoundError('Marca informada não encontrada'));
    });

    it('deve lançar conflito 409 se alteração de nome colidir com modelo existente', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(mockModel);
      vi.mocked(modelRepository.findByNameAndBrand).mockResolvedValue({
        ...mockModel,
        id: 'outro-modelo-id',
      });

      await expect(
        modelService.update(mockModel.id, { name: 'Yaris' }, 'tenant-1')
      ).rejects.toThrow(new AppError('Modelo já cadastrado para esta marca', 409));
    });
  });

  describe('delete', () => {
    it('deve deletar modelo com sucesso no tenant', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(mockModel);
      vi.mocked(modelRepository.delete).mockResolvedValue(mockModel);

      const result = await modelService.delete(mockModel.id, 'tenant-1');

      expect(modelRepository.delete).toHaveBeenCalledWith(mockModel.id, 'tenant-1');
      expect(result).toEqual(mockModel);
    });

    it('deve lançar NotFoundError ao deletar modelo inexistente no tenant', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(null);

      await expect(modelService.delete('id-inexistente', 'tenant-1')).rejects.toThrow(NotFoundError);
    });
  });
});
