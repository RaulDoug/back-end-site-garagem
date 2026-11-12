import {
  FeatureRepository,
  Feature,
  CreateFeatureData,
  featureRepository as defaultFeatureRepository,
} from '#repositories/feature.repository.js';
import BaseService from '#services/base.service.js';
import { FindData } from '#repositories/base.repository.js';
import { createFeatureSchema } from '#schemas/feature.schema.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';

export default class FeatureService extends BaseService<Feature, CreateFeatureData> {
  constructor(protected override repository: FeatureRepository = defaultFeatureRepository) {
    super(repository);
  }

  override async find(filters: FindData = { filters: [] }, tenantId?: string): Promise<Feature[]> {
    return await this.repository.findForTenant(tenantId, filters);
  }

  override async findById(id: string, tenantId?: string): Promise<Feature> {
    const feature = await this.repository.findByIdForTenant(id, tenantId);
    if (!feature) {
      throw new NotFoundError('Opcional não encontrado');
    }
    return feature;
  }

  override async create(data: unknown, tenantId?: string): Promise<Feature> {
    const validated = createFeatureSchema.shape.body.parse(data);

    const existing = await this.repository.findByNameForTenant(validated.name, tenantId);
    if (existing) {
      throw new AppError('Opcional já cadastrado', 409);
    }

    return await this.repository.create({
      name: validated.name,
      tenant_id: tenantId ?? null,
    });
  }

  override async update(id: string, data: unknown, tenantId?: string): Promise<Feature> {
    const feature = await this.repository.findByIdForTenant(id, tenantId);
    if (!feature) {
      throw new NotFoundError('Opcional não encontrado');
    }

    if (feature.tenant_id === null || (tenantId && feature.tenant_id !== tenantId)) {
      throw new AppError('Não é permitido alterar ou excluir um opcional global do sistema', 403);
    }

    const updateData = data as Partial<CreateFeatureData>;
    if (updateData.name && updateData.name.toLowerCase() !== feature.name.toLowerCase()) {
      const duplicate = await this.repository.findByNameForTenant(updateData.name, tenantId);
      if (duplicate && duplicate.id !== id) {
        throw new AppError('Nome de opcional já cadastrado', 409);
      }
    }

    return await super.update(id, updateData, tenantId);
  }

  override async delete(id: string, tenantId?: string): Promise<Feature> {
    const feature = await this.repository.findByIdForTenant(id, tenantId);
    if (!feature) {
      throw new NotFoundError('Opcional não encontrado');
    }

    if (feature.tenant_id === null || (tenantId && feature.tenant_id !== tenantId)) {
      throw new AppError('Não é permitido alterar ou excluir um opcional global do sistema', 403);
    }

    return await super.delete(id, tenantId);
  }
}
