import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeatureService from '#services/feature.service.js';
import { FeatureRepository, type Feature } from '#repositories/feature.repository.js';
import { BadRequestError, NotFoundError } from '#src/errors/app.error.js';

const mockFeature: Feature = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Ar-condicionado',
};

describe('FeatureService', () => {
  let featureRepository: FeatureRepository;
  let featureService: FeatureService;

  beforeEach(() => {
    vi.resetAllMocks();
    featureRepository = {
      findById: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as FeatureRepository;

    featureService = new FeatureService(featureRepository);
  });

  describe('findById', () => {
    it('deve retornar o opcional quando existir', async () => {
      vi.mocked(featureRepository.findById).mockResolvedValue(mockFeature);

      const result = await featureService.findById(mockFeature.id);

      expect(featureRepository.findById).toHaveBeenCalledWith(mockFeature.id);
      expect(result).toEqual(mockFeature);
    });

    it('deve lançar NotFoundError se o opcional não existir', async () => {
      vi.mocked(featureRepository.findById).mockResolvedValue(null);

      await expect(featureService.findById('uuid-inexistente')).rejects.toThrow(NotFoundError);
    });
  });

  describe('find', () => {
    it('deve retornar a lista de opcionais', async () => {
      vi.mocked(featureRepository.find).mockResolvedValue([mockFeature]);

      const filters = { filters: [] };
      const result = await featureService.find(filters);

      expect(featureRepository.find).toHaveBeenCalledWith(filters);
      expect(result).toEqual([mockFeature]);
    });
  });

  describe('create', () => {
    it('deve criar um opcional com sucesso', async () => {
      vi.mocked(featureRepository.create).mockResolvedValue(mockFeature);

      const result = await featureService.create({ name: 'Ar-condicionado' });

      expect(featureRepository.create).toHaveBeenCalledWith({ name: 'Ar-condicionado' });
      expect(result).toEqual(mockFeature);
    });

    it('deve lançar BadRequestError se a criação falhar', async () => {
      vi.mocked(featureRepository.create).mockResolvedValue(null as unknown as Feature);

      await expect(featureService.create({ name: 'Ar-condicionado' })).rejects.toThrow(BadRequestError);
    });
  });

  describe('update', () => {
    it('deve atualizar o opcional com sucesso', async () => {
      const updatedFeature = { ...mockFeature, name: 'Ar-condicionado Digital' };
      vi.mocked(featureRepository.update).mockResolvedValue(updatedFeature);

      const result = await featureService.update(mockFeature.id, { name: 'Ar-condicionado Digital' });

      expect(featureRepository.update).toHaveBeenCalledWith(mockFeature.id, { name: 'Ar-condicionado Digital' });
      expect(result).toEqual(updatedFeature);
    });

    it('deve lançar BadRequestError se body for vazio', async () => {
      await expect(featureService.update(mockFeature.id, {})).rejects.toThrow(BadRequestError);
    });

    it('deve lançar NotFoundError ao tentar atualizar opcional inexistente', async () => {
      vi.mocked(featureRepository.update).mockResolvedValue(null);

      await expect(featureService.update('id-inexistente', { name: 'Novo' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('deve deletar opcional com sucesso', async () => {
      vi.mocked(featureRepository.delete).mockResolvedValue(mockFeature);

      const result = await featureService.delete(mockFeature.id);

      expect(featureRepository.delete).toHaveBeenCalledWith(mockFeature.id);
      expect(result).toEqual(mockFeature);
    });

    it('deve lançar NotFoundError ao deletar opcional inexistente', async () => {
      vi.mocked(featureRepository.delete).mockResolvedValue(null);

      await expect(featureService.delete('id-inexistente')).rejects.toThrow(NotFoundError);
    });
  });
});
