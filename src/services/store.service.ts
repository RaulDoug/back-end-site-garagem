import { CreateStoreData, Store, StoreRepository } from '#repositories/store.repository.js';
import {
  TenantRepository,
  tenantRepository as defaultTenantRepository,
} from '#repositories/tenant.repository.js';
import { AppError, NotFoundError } from '#src/errors/app.error.js';
import BaseService from '#services/base.service.js';
import { FindData } from '#repositories/base.repository.js';
import { createStoreSchema } from '#schemas/store.schema.js';

export default class StoreService extends BaseService<Store, CreateStoreData> {
  constructor(
    protected override repository = new StoreRepository(),
    private readonly tenantRepository: TenantRepository = defaultTenantRepository
  ) {
    super(repository);
  }

  async findByCNPJ(cnpj: string, tenantId?: string): Promise<Store> {
    const cleanCnpj = cnpj.replace(/\D/g, '');
    const store = await this.repository.findByCNPJ(cleanCnpj.length === 14 ? cleanCnpj : cnpj);

    if (store === null || (tenantId && store.tenant_id !== tenantId)) {
      throw new NotFoundError(`Loja com CNPJ ${cnpj} não encontrada`);
    }

    return store;
  }

  async create(data: unknown, tenantId?: string): Promise<Store> {
    if (!tenantId || tenantId.trim() === '') {
      throw new AppError('Tenant não identificado', 401);
    }

    const validatedData = createStoreSchema.shape.body.parse(data);

    const existingStore = await this.repository.findByCNPJ(validatedData.cnpj);
    if (existingStore !== null) {
      throw new AppError('CNPJ já cadastrado', 409);
    }

    return await this.repository.create({
      ...validatedData,
      tenant_id: tenantId,
    });
  }

  override async find(filters: FindData = { filters: [] }, tenantId?: string): Promise<Store[]> {
    return await super.find(filters, tenantId);
  }

  override async findById(id: string, tenantId?: string): Promise<Store> {
    return await super.findById(id, tenantId);
  }

  async findPublicById(id: string): Promise<Store> {
    const store = await this.repository.findById(id);

    if (!store || !store.is_active || store.deleted_at != null) {
      throw new NotFoundError('Loja não encontrada');
    }

    const tenant = await this.tenantRepository.findById(store.tenant_id);
    if (!tenant || !tenant.is_active || tenant.deleted_at != null) {
      throw new NotFoundError('Loja não encontrada');
    }

    return store;
  }

  override async update(id: string, data: unknown, tenantId?: string): Promise<Store> {
    if (!tenantId || tenantId.trim() === '') {
      throw new AppError('Tenant não identificado', 401);
    }

    await super.findById(id, tenantId);

    let updateData = data as Partial<CreateStoreData>;
    if (updateData.cnpj) {
      const cleanCnpj = updateData.cnpj.replace(/\D/g, '');
      const lookupCnpj = cleanCnpj.length === 14 ? cleanCnpj : updateData.cnpj;
      updateData = { ...updateData, cnpj: lookupCnpj };

      const existingStore = await this.repository.findByCNPJ(lookupCnpj);

      if (existingStore !== null && existingStore.id.toLowerCase() !== id.toLowerCase()) {
        throw new AppError('CNPJ já em uso por outra loja', 409);
      }
    }

    return await super.update(id, updateData, tenantId);
  }

  override async delete(id: string, tenantId?: string, actorStoreId?: string | null): Promise<Store> {
    if (!tenantId || tenantId.trim() === '') {
      throw new AppError('Tenant não identificado', 401);
    }

    await super.findById(id, tenantId);

    if (actorStoreId && actorStoreId.toLowerCase() === id.toLowerCase()) {
      throw new AppError('Não é permitido excluir a própria filial vinculada ao usuário', 409);
    }

    if (typeof this.repository.hasActiveDependencies === 'function') {
      const hasDeps = await this.repository.hasActiveDependencies(id, tenantId);
      if (hasDeps === true) {
        throw new AppError('Não é possível excluir loja com usuários ou veículos ativos vinculados', 409);
      }
    }

    return await super.delete(id, tenantId);
  }
}
