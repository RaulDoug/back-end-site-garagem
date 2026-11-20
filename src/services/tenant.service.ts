import BaseService from '#services/base.service.js';
import {
  Tenant,
  CreateTenantData,
  TenantRepository,
  tenantRepository as defaultTenantRepository,
} from '#repositories/tenant.repository.js';
import {
  StoreRepository,
  storeRepository as defaultStoreRepository,
} from '#repositories/store.repository.js';
import {
  onboardTenantSchema,
  updateTenantSchema,
  OnboardTenantInput,
  UpdateTenantInput,
} from '#schemas/tenant.schema.js';
import { AppError, BadRequestError, NotFoundError } from '#src/errors/app.error.js';
import { hashPassword } from '#utils/hash.util.js';
import { generateToken } from '#utils/jwt.util.js';

export default class TenantService extends BaseService<Tenant, CreateTenantData> {
  constructor(
    protected override repository: TenantRepository = defaultTenantRepository,
    private storeRepo: StoreRepository = defaultStoreRepository
  ) {
    super(repository);
  }

  async onboard(data: unknown) {
    const validated: OnboardTenantInput = onboardTenantSchema.parse(data);

    const existingTenant = await this.repository.findByCNPJ(validated.tenant.cnpj);
    if (existingTenant) {
      throw new AppError('CNPJ da empresa já está em uso', 409);
    }

    const cleanStoreCnpj = validated.store.cnpj.replace(/\D/g, '');
    const existingStore = await this.storeRepo.findByCNPJ(cleanStoreCnpj);
    if (existingStore) {
      throw new AppError('CNPJ da loja já está em uso', 409);
    }

    const password_hash = await hashPassword(validated.admin.password);

    const { tenant, store, admin } = await this.repository.onboardTenant({
      is_multi_store: validated.is_multi_store,
      tenant: validated.tenant,
      store: validated.store,
      admin: {
        name: validated.admin.name,
        email: validated.admin.email,
        password_hash,
        phone: validated.admin.phone,
      },
    });

    const token = generateToken({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      tenantId: tenant.id,
      storeId: admin.store_id ?? null,
    });

    return {
      tenant,
      store,
      admin,
      token,
    };
  }

  async getById(tenantId: string): Promise<Tenant> {
    const tenant = await this.repository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundError('Empresa não encontrada');
    }
    return tenant;
  }

  async update(tenantId: string, data: unknown): Promise<Tenant> {
    const validated: UpdateTenantInput = updateTenantSchema.parse(data);

    if (!Object.values(validated).some((v) => v !== undefined)) {
      throw new BadRequestError('Nenhum dado informado');
    }

    await this.getById(tenantId);

    if (validated.cnpj) {
      const existing = await this.repository.findByCNPJ(validated.cnpj);
      if (existing && existing.id !== tenantId) {
        throw new AppError('CNPJ da empresa já está em uso', 409);
      }
    }

    const updated = await this.repository.update(tenantId, validated);
    if (!updated) {
      throw new NotFoundError('Empresa não encontrada');
    }

    return updated;
  }
}
