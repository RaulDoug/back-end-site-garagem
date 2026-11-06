import { describe, it, expect, vi, beforeEach } from 'vitest';
import BrandService from '#services/brand.service.js';
import { BrandRepository, type Brand } from '#repositories/brand.repository.js';
import { BadRequestError, NotFoundError } from '#src/errors/app.error.js';

const mockBrand: Brand = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  name: 'Toyota',
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
    } as unknown as BrandRepository;

    brandService = new BrandService(brandRepository);
  });

  describe('findById', () => {
    it('deve retornar a marca quando encontrada', async () => {
      vi.mocked(brandRepository.findById).mockResolvedValue(mockBrand);

      const result = await brandService.findById(mockBrand.id);

      expect(brandRepository.findById).toHaveBeenCalledWith(mockBrand.id);
      expect(result).toEqual(mockBrand);
    });

    it('deve lançar NotFoundError quando a marca não existir', async () => {
      vi.mocked(brandRepository.findById).mockResolvedValue(null);

      await expect(brandService.findById('uuid-inexistente')).rejects.toThrow(NotFoundError);
    });
  });

  describe('find', () => {
    it('deve retornar lista de marcas', async () => {
      vi.mocked(brandRepository.find).mockResolvedValue([mockBrand]);

      const filters = { filters: [] };
      const result = await brandService.find(filters);

      expect(brandRepository.find).toHaveBeenCalledWith(filters);
      expect(result).toEqual([mockBrand]);
    });
  });

  describe('create', () => {
    it('deve criar uma marca com sucesso', async () => {
      vi.mocked(brandRepository.create).mockResolvedValue(mockBrand);

      const result = await brandService.create({ name: 'Toyota' });

      expect(brandRepository.create).toHaveBeenCalledWith({ name: 'Toyota' });
      expect(result).toEqual(mockBrand);
    });

    it('deve lançar BadRequestError se a criação falhar', async () => {
      vi.mocked(brandRepository.create).mockResolvedValue(null as unknown as Brand);

      await expect(brandService.create({ name: 'Toyota' })).rejects.toThrow(BadRequestError);
    });
  });

  describe('update', () => {
    it('deve atualizar a marca com sucesso', async () => {
      const updatedBrand = { ...mockBrand, name: 'Toyota Motors' };
      vi.mocked(brandRepository.update).mockResolvedValue(updatedBrand);

      const result = await brandService.update(mockBrand.id, { name: 'Toyota Motors' });

      expect(brandRepository.update).toHaveBeenCalledWith(mockBrand.id, { name: 'Toyota Motors' });
      expect(result).toEqual(updatedBrand);
    });

    it('deve lançar BadRequestError se nenhum dado for informado', async () => {
      await expect(brandService.update(mockBrand.id, {})).rejects.toThrow(BadRequestError);
    });

    it('deve lançar NotFoundError se a marca para update não existir', async () => {
      vi.mocked(brandRepository.update).mockResolvedValue(null);

      await expect(brandService.update('id-inexistente', { name: 'Novo' })).rejects.toThrow(NotFoundError);
    });
  });

  describe('delete', () => {
    it('deve deletar a marca com sucesso', async () => {
      vi.mocked(brandRepository.delete).mockResolvedValue(mockBrand);

      const result = await brandService.delete(mockBrand.id);

      expect(brandRepository.delete).toHaveBeenCalledWith(mockBrand.id);
      expect(result).toEqual(mockBrand);
    });

    it('deve lançar NotFoundError ao deletar marca inexistente', async () => {
      vi.mocked(brandRepository.delete).mockResolvedValue(null);

      await expect(brandService.delete('id-inexistente')).rejects.toThrow(NotFoundError);
    });
  });
});
