import { BrandRepository, Brand, CreateBrandData, brandRepository as defaultBrandRepository } from '#repositories/brand.repository.js';
import BaseService from '#services/base.service.js';
import { FindData } from '#repositories/base.repository.js';
import { createBrandSchema } from '#schemas/brand.schema.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

export default class BrandService extends BaseService<Brand, CreateBrandData> {
  constructor(protected override repository: BrandRepository = defaultBrandRepository) {
    super(repository);
  }

  override async find(filters: FindData = { filters: [] }, tenantId?: string): Promise<Brand[]> {
    return await this.repository.findForTenant(tenantId, filters);
  }

  override async findById(id: string, tenantId?: string): Promise<Brand> {
    const brand = await this.repository.findByIdForTenant(id, tenantId);
    if (!brand) {
      throw new NotFoundError('Marca não encontrada');
    }
    return brand;
  }

  override async create(data: unknown, tenantId?: string): Promise<Brand> {
    const validated = createBrandSchema.shape.body.parse(data);

    const existing = await this.repository.findByNameForTenant(validated.name, tenantId);
    if (existing) {
      throw new AppError('Marca já cadastrada', 409);
    }

    return await this.repository.create({
      name: validated.name,
      tenant_id: tenantId ?? null,
    });
  }

  override async update(id: string, data: unknown, tenantId?: string): Promise<Brand> {
    const brand = await this.repository.findByIdForTenant(id, tenantId);
    if (!brand) {
      throw new NotFoundError('Marca não encontrada');
    }

    if (brand.tenant_id === null || (tenantId && brand.tenant_id !== tenantId)) {
      throw new AppError('Não é permitido alterar ou excluir uma marca global do sistema', 403);
    }

    const updateData = data as Partial<CreateBrandData>;
    if (updateData.name && updateData.name.toLowerCase() !== brand.name.toLowerCase()) {
      const duplicate = await this.repository.findByNameForTenant(updateData.name, tenantId);
      if (duplicate && duplicate.id !== id) {
        throw new AppError('Nome de marca já cadastrado', 409);
      }
    }

    return await super.update(id, updateData, tenantId);
  }

  override async delete(id: string, tenantId?: string): Promise<Brand> {
    const brand = await this.repository.findByIdForTenant(id, tenantId);
    if (!brand) {
      throw new NotFoundError('Marca não encontrada');
    }

    if (brand.tenant_id === null || (tenantId && brand.tenant_id !== tenantId)) {
      throw new AppError('Não é permitido alterar ou excluir uma marca global do sistema', 403);
    }

    return await super.delete(id, tenantId);
  }
}
