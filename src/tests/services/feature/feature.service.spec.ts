import { describe, it, expect, vi, beforeEach } from 'vitest';
import FeatureService from '#services/feature.service.js';
import { FeatureRepository, type Feature } from '#repositories/feature.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

const mockGlobalFeature: Feature = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  tenant_id: null,
  name: 'Ar-condicionado',
};

const mockTenantFeature: Feature = {
  id: '8c9e6679-7425-40de-944b-e07fc1f90ae8',
  tenant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Teto Solar Panorâmico Custom',
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
      findForTenant: vi.fn(),
      findByIdForTenant: vi.fn(),
      findByIdsForTenant: vi.fn(),
      findByNameForTenant: vi.fn(),
    } as unknown as FeatureRepository;

    featureService = new FeatureService(featureRepository);
  });

  describe('findById', () => {
    it('deve retornar o opcional quando existir para o tenant', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(mockGlobalFeature);

      const result = await featureService.findById(mockGlobalFeature.id, 'tenant-1');

      expect(featureRepository.findByIdForTenant).toHaveBeenCalledWith(mockGlobalFeature.id, 'tenant-1');
      expect(result).toEqual(mockGlobalFeature);
    });

    it('deve lançar NotFoundError se o opcional não existir', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(featureService.findById('uuid-inexistente', 'tenant-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('find', () => {
    it('deve retornar a lista de opcionais acessíveis ao tenant', async () => {
      vi.mocked(featureRepository.findForTenant).mockResolvedValue([mockGlobalFeature, mockTenantFeature]);

      const filters = { filters: [] };
      const result = await featureService.find(filters, 'tenant-1');

      expect(featureRepository.findForTenant).toHaveBeenCalledWith('tenant-1', filters);
      expect(result).toEqual([mockGlobalFeature, mockTenantFeature]);
    });
  });

  describe('create', () => {
    it('deve criar um opcional customizado para o tenant com sucesso', async () => {
      vi.mocked(featureRepository.findByNameForTenant).mockResolvedValue(null);
      vi.mocked(featureRepository.create).mockResolvedValue(mockTenantFeature);

      const result = await featureService.create(
        { name: 'Teto Solar Panorâmico Custom' },
        mockTenantFeature.tenant_id!
      );

      expect(featureRepository.findByNameForTenant).toHaveBeenCalledWith(
        'Teto Solar Panorâmico Custom',
        mockTenantFeature.tenant_id
      );
      expect(featureRepository.create).toHaveBeenCalledWith({
        name: 'Teto Solar Panorâmico Custom',
        tenant_id: mockTenantFeature.tenant_id,
      });
      expect(result).toEqual(mockTenantFeature);
    });

    it('deve lançar conflito 409 se o opcional já existir', async () => {
      vi.mocked(featureRepository.findByNameForTenant).mockResolvedValue(mockGlobalFeature);

      await expect(
        featureService.create({ name: 'Ar-condicionado' }, 'tenant-1')
      ).rejects.toThrow(new AppError('Opcional já cadastrado', 409));
    });
  });

  describe('update', () => {
    it('deve atualizar o opcional do tenant com sucesso', async () => {
      const updatedFeature = { ...mockTenantFeature, name: 'Teto Solar Atualizado' };
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(mockTenantFeature);
      vi.mocked(featureRepository.findByNameForTenant).mockResolvedValue(null);
      vi.mocked(featureRepository.update).mockResolvedValue(updatedFeature);

      const result = await featureService.update(
        mockTenantFeature.id,
        { name: 'Teto Solar Atualizado' },
        mockTenantFeature.tenant_id!
      );

      expect(featureRepository.update).toHaveBeenCalledWith(
        mockTenantFeature.id,
        { name: 'Teto Solar Atualizado' },
        mockTenantFeature.tenant_id
      );
      expect(result).toEqual(updatedFeature);
    });

    it('deve lançar 403 Forbidden ao tentar alterar opcional global do sistema', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(mockGlobalFeature);

      await expect(
        featureService.update(mockGlobalFeature.id, { name: 'Novo Nome' }, 'tenant-1')
      ).rejects.toThrow(new AppError('Não é permitido alterar ou excluir um opcional global do sistema', 403));
    });

    it('deve lançar NotFoundError ao tentar atualizar opcional inexistente', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(
        featureService.update('id-inexistente', { name: 'Novo' }, 'tenant-1')
      ).rejects.toThrow(NotFoundError);
    });

    it('deve lançar conflito 409 se nome alterado colidir com outro opcional', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(mockTenantFeature);
      vi.mocked(featureRepository.findByNameForTenant).mockResolvedValue({
        ...mockGlobalFeature,
        id: 'outro-id',
      });

      await expect(
        featureService.update(mockTenantFeature.id, { name: 'Ar-condicionado' }, mockTenantFeature.tenant_id!)
      ).rejects.toThrow(new AppError('Nome de opcional já cadastrado', 409));
    });
  });

  describe('delete', () => {
    it('deve deletar opcional do tenant com sucesso', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(mockTenantFeature);
      vi.mocked(featureRepository.delete).mockResolvedValue(mockTenantFeature);

      const result = await featureService.delete(mockTenantFeature.id, mockTenantFeature.tenant_id!);

      expect(featureRepository.delete).toHaveBeenCalledWith(mockTenantFeature.id, mockTenantFeature.tenant_id);
      expect(result).toEqual(mockTenantFeature);
    });

    it('deve lançar 403 Forbidden ao tentar excluir opcional global do sistema', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(mockGlobalFeature);

      await expect(featureService.delete(mockGlobalFeature.id, 'tenant-1')).rejects.toThrow(
        new AppError('Não é permitido alterar ou excluir um opcional global do sistema', 403)
      );
    });

    it('deve lançar NotFoundError ao deletar opcional inexistente', async () => {
      vi.mocked(featureRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(featureService.delete('id-inexistente', 'tenant-1')).rejects.toThrow(NotFoundError);
    });
  });
});
