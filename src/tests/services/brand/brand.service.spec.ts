import { describe, it, expect, vi, beforeEach } from 'vitest';
import BrandService from '#services/brand.service.js';
import { BrandRepository, type Brand } from '#repositories/brand.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

const mockGlobalBrand: Brand = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  tenant_id: null,
  name: 'Toyota',
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

const mockTenantBrand: Brand = {
  id: '8c9e6679-7425-40de-944b-e07fc1f90ae8',
  tenant_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  name: 'Custom Brand',
  is_active: true,
  deleted_at: null,
  created_at: new Date(),
};

describe('BrandService', () => {
  let brandRepository: BrandRepository;
  let brandService: BrandService;

  beforeEach(() => {
    vi.resetAllMocks();
    brandRepository = {
      findById: vi.fn(),
      find: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findForTenant: vi.fn(),
      findByIdForTenant: vi.fn(),
      findByNameForTenant: vi.fn(),
    } as unknown as BrandRepository;

    brandService = new BrandService(brandRepository);
  });

  describe('findById', () => {
    it('deve retornar a marca quando encontrada', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockGlobalBrand);

      const result = await brandService.findById(mockGlobalBrand.id, 'tenant-1');

      expect(brandRepository.findByIdForTenant).toHaveBeenCalledWith(mockGlobalBrand.id, 'tenant-1');
      expect(result).toEqual(mockGlobalBrand);
    });

    it('deve lançar NotFoundError quando a marca não existir', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(brandService.findById('uuid-inexistente', 'tenant-1')).rejects.toThrow(NotFoundError);
    });
  });

  describe('find', () => {
    it('deve retornar lista de marcas do tenant', async () => {
      vi.mocked(brandRepository.findForTenant).mockResolvedValue([mockGlobalBrand, mockTenantBrand]);

      const filters = { filters: [] };
      const result = await brandService.find(filters, 'tenant-1');

      expect(brandRepository.findForTenant).toHaveBeenCalledWith('tenant-1', filters);
      expect(result).toEqual([mockGlobalBrand, mockTenantBrand]);
    });
  });

  describe('create', () => {
    it('deve criar uma marca para o tenant com sucesso', async () => {
      vi.mocked(brandRepository.findByNameForTenant).mockResolvedValue(null);
      vi.mocked(brandRepository.create).mockResolvedValue(mockTenantBrand);

      const result = await brandService.create({ name: 'Custom Brand' }, mockTenantBrand.tenant_id!);

      expect(brandRepository.findByNameForTenant).toHaveBeenCalledWith('Custom Brand', mockTenantBrand.tenant_id);
      expect(brandRepository.create).toHaveBeenCalledWith({
        name: 'Custom Brand',
        tenant_id: mockTenantBrand.tenant_id,
      });
      expect(result).toEqual(mockTenantBrand);
    });

    it('deve lançar conflito 409 se a marca já existir para o tenant ou global', async () => {
      vi.mocked(brandRepository.findByNameForTenant).mockResolvedValue(mockGlobalBrand);

      await expect(brandService.create({ name: 'Toyota' }, 'tenant-1')).rejects.toThrow(
        new AppError('Marca já cadastrada', 409),
      );
    });
  });

  describe('update', () => {
    it('deve atualizar a marca do tenant com sucesso', async () => {
      const updatedBrand = { ...mockTenantBrand, name: 'Updated Custom Brand' };
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockTenantBrand);
      vi.mocked(brandRepository.findByNameForTenant).mockResolvedValue(null);
      vi.mocked(brandRepository.update).mockResolvedValue(updatedBrand);

      const result = await brandService.update(
        mockTenantBrand.id,
        { name: 'Updated Custom Brand' },
        mockTenantBrand.tenant_id!,
      );

      expect(brandRepository.update).toHaveBeenCalledWith(
        mockTenantBrand.id,
        { name: 'Updated Custom Brand' },
        mockTenantBrand.tenant_id,
      );
      expect(result).toEqual(updatedBrand);
    });

    it('deve lançar 403 Forbidden ao tentar alterar marca global do sistema', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockGlobalBrand);

      await expect(
        brandService.update(mockGlobalBrand.id, { name: 'Novo Nome' }, 'tenant-1'),
      ).rejects.toThrow(new AppError('Não é permitido alterar ou excluir uma marca global do sistema', 403));
    });

    it('deve lançar NotFoundError se a marca para update não existir', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(
        brandService.update('id-inexistente', { name: 'Novo' }, 'tenant-1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('deve lançar conflito 409 se nome alterado colidir com outra marca', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockTenantBrand);
      vi.mocked(brandRepository.findByNameForTenant).mockResolvedValue({
        ...mockGlobalBrand,
        id: 'outra-marca-id',
      });

      await expect(
        brandService.update(mockTenantBrand.id, { name: 'Toyota' }, mockTenantBrand.tenant_id!),
      ).rejects.toThrow(new AppError('Nome de marca já cadastrado', 409));
    });
  });

  describe('delete', () => {
    it('deve deletar a marca do tenant com sucesso', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockTenantBrand);
      vi.mocked(brandRepository.delete).mockResolvedValue(mockTenantBrand);

      const result = await brandService.delete(mockTenantBrand.id, mockTenantBrand.tenant_id!);

      expect(brandRepository.delete).toHaveBeenCalledWith(mockTenantBrand.id, mockTenantBrand.tenant_id);
      expect(result).toEqual(mockTenantBrand);
    });

    it('deve lançar 403 Forbidden ao tentar excluir marca global do sistema', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(mockGlobalBrand);

      await expect(brandService.delete(mockGlobalBrand.id, 'tenant-1')).rejects.toThrow(
        new AppError('Não é permitido alterar ou excluir uma marca global do sistema', 403),
      );
    });

    it('deve lançar NotFoundError ao deletar marca inexistente', async () => {
      vi.mocked(brandRepository.findByIdForTenant).mockResolvedValue(null);

      await expect(brandService.delete('id-inexistente', 'tenant-1')).rejects.toThrow(NotFoundError);
    });
  });
});
