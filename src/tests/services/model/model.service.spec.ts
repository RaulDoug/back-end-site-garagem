import { describe, it, expect, vi, beforeEach } from 'vitest';
import ModelService from '#services/model.service.js';
import { ModelRepository, type Model } from '#repositories/model.repository.js';
import { BadRequestError, NotFoundError } from '#src/errors/app.error.js';

const mockModel: Model = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  brand_id: '3a8d1c2b-7a61-4e59-9b0a-2c3d4e5f6a7b',
  name: 'Corolla',
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

describe('ModelService', () => {
  let modelRepository: ModelRepository;
  let modelService: ModelService;

  beforeEach(() => {
    vi.resetAllMocks();
    modelRepository = {
      findById: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as ModelRepository;

    modelService = new ModelService(modelRepository);
  });

  describe('findById', () => {
    it('deve retornar o modelo quando encontrado', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(mockModel);

      const result = await modelService.findById(mockModel.id);

      expect(modelRepository.findById).toHaveBeenCalledWith(mockModel.id);
      expect(result).toEqual(mockModel);
    });

    it('deve lançar NotFoundError se o modelo não existir', async () => {
      vi.mocked(modelRepository.findById).mockResolvedValue(null);

      await expect(modelService.findById('uuid-inexistente')).rejects.toThrow(NotFoundError);
    });
  });

  describe('find', () => {
    it('deve retornar lista de modelos filtrados', async () => {
      vi.mocked(modelRepository.find).mockResolvedValue([mockModel]);

      const filters = { filters: [] };
      const result = await modelService.find(filters);

      expect(modelRepository.find).toHaveBeenCalledWith(filters);
      expect(result).toEqual([mockModel]);
    });
  });

  describe('create', () => {
    it('deve criar um modelo com sucesso', async () => {
      vi.mocked(modelRepository.create).mockResolvedValue(mockModel);

      const payload = { brand_id: mockModel.brand_id, name: 'Corolla' };
      const result = await modelService.create(payload);

      expect(modelRepository.create).toHaveBeenCalledWith(payload);
      expect(result).toEqual(mockModel);
    });

    it('deve lançar BadRequestError se a criação falhar', async () => {
      vi.mocked(modelRepository.create).mockResolvedValue(null as unknown as Model);

      await expect(modelService.create({ brand_id: mockModel.brand_id, name: 'Corolla' })).rejects.toThrow(BadRequestError);
    });
  });

  describe('update', () => {
    it('deve atualizar o modelo com sucesso', async () => {
      const updatedModel = { ...mockModel, name: 'Corolla GLi' };
      vi.mocked(modelRepository.update).mockResolvedValue(updatedModel);

      const result = await modelService.update(mockModel.id, { name: 'Corolla GLi' });

      expect(modelRepository.update).toHaveBeenCalledWith(mockModel.id, { name: 'Corolla GLi' });
      expect(result).toEqual(updatedModel);
    });

    it('deve lançar BadRequestError se body for vazio', async () => {
      await expect(modelService.update(mockModel.id, {})).rejects.toThrow(BadRequestError);
    });

    it('deve lançar NotFoundError ao tentar atualizar modelo inexistente', async () => {
      vi.mocked(modelRepository.update).mockResolvedValue(null);

      await expect(modelService.update('id-inexistente', { name: 'Novo' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('deve deletar modelo com sucesso', async () => {
      vi.mocked(modelRepository.delete).mockResolvedValue(mockModel);

      const result = await modelService.delete(mockModel.id);

      expect(modelRepository.delete).toHaveBeenCalledWith(mockModel.id);
      expect(result).toEqual(mockModel);
    });

    it('deve lançar NotFoundError ao deletar modelo inexistente', async () => {
      vi.mocked(modelRepository.delete).mockResolvedValue(null);

      await expect(modelService.delete('id-inexistente')).rejects.toThrow(NotFoundError);
    });
  });
});
