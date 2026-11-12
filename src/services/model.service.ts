import {
  ModelRepository,
  Model,
  CreateModelData,
  modelRepository as defaultModelRepository,
} from '#repositories/model.repository.js';
import {
  BrandRepository,
  brandRepository as defaultBrandRepository,
} from '#repositories/brand.repository.js';
import BaseService from '#services/base.service.js';
import { FindData } from '#repositories/base.repository.js';
import { createModelSchema } from '#schemas/model.schema.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

export default class ModelService extends BaseService<Model, CreateModelData> {
  constructor(
    protected override repository: ModelRepository = defaultModelRepository,
    protected brandRepository: BrandRepository = defaultBrandRepository
  ) {
    super(repository);
  }

  override async find(filters: FindData = { filters: [] }, tenantId?: string): Promise<Model[]> {
    if (!tenantId) {
      throw new AppError('Tenant não identificado', 400);
    }
    return await super.find(filters, tenantId);
  }

  override async findById(id: string, tenantId?: string): Promise<Model> {
    if (!tenantId) {
      throw new AppError('Tenant não identificado', 400);
    }
    const model = await this.repository.findById(id, tenantId);
    if (!model) {
      throw new NotFoundError('Modelo não encontrado');
    }
    return model;
  }

  override async create(data: unknown, tenantId?: string): Promise<Model> {
    if (!tenantId) {
      throw new AppError('Tenant não identificado', 400);
    }
    const validated = createModelSchema.shape.body.parse(data);

    const brand = await this.brandRepository.findByIdForTenant(validated.brand_id, tenantId);
    if (!brand) {
      throw new NotFoundError('Marca informada não encontrada');
    }

    const existing = await this.repository.findByNameAndBrand(validated.name, validated.brand_id, tenantId);
    if (existing) {
      throw new AppError('Modelo já cadastrado para esta marca', 409);
    }

    return await this.repository.create({
      tenant_id: tenantId,
      brand_id: validated.brand_id,
      name: validated.name,
    });
  }

  override async update(id: string, data: unknown, tenantId?: string): Promise<Model> {
    if (!tenantId) {
      throw new AppError('Tenant não identificado', 400);
    }
    const model = await this.repository.findById(id, tenantId);
    if (!model) {
      throw new NotFoundError('Modelo não encontrado');
    }

    const updateData = data as Partial<CreateModelData>;
    const targetBrandId = updateData.brand_id || model.brand_id;
    const targetName = updateData.name || model.name;

    if (updateData.brand_id && updateData.brand_id !== model.brand_id) {
      const brand = await this.brandRepository.findByIdForTenant(updateData.brand_id, tenantId);
      if (!brand) {
        throw new NotFoundError('Marca informada não encontrada');
      }
    }

    if (
      (updateData.name && updateData.name.toLowerCase() !== model.name.toLowerCase()) ||
      (updateData.brand_id && updateData.brand_id !== model.brand_id)
    ) {
      const existing = await this.repository.findByNameAndBrand(targetName, targetBrandId, tenantId);
      if (existing && existing.id !== id) {
        throw new AppError('Modelo já cadastrado para esta marca', 409);
      }
    }

    return await super.update(id, updateData, tenantId);
  }

  override async delete(id: string, tenantId?: string): Promise<Model> {
    if (!tenantId) {
      throw new AppError('Tenant não identificado', 400);
    }
    const model = await this.repository.findById(id, tenantId);
    if (!model) {
      throw new NotFoundError('Modelo não encontrado');
    }
    return await super.delete(id, tenantId);
  }
}
