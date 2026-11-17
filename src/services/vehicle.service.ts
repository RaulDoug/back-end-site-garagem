import BaseService from '#services/base.service.js';
import {
  VehicleRepository,
  type Vehicle,
  type CreateVehicleData,
  type FindCatalogFilters,
} from '#repositories/vehicle.repository.js';
import { StoreRepository } from '#repositories/store.repository.js';
import { ModelRepository } from '#repositories/model.repository.js';
import { FeatureRepository } from '#repositories/feature.repository.js';
import { sanitizeVehicleForRole } from '#utils/vehicle-sanitizer.util.js';
import { viewTracker } from '#utils/view-tracker.util.js';
import { NotFoundError, BadRequestError, AppError } from '#src/errors/app.error.js';

export interface TenantExecutionContext {
  tenantId: string;
  userStoreId?: string | null;
  filterStoreId?: string | null;
}

export default class VehicleService extends BaseService<Vehicle, CreateVehicleData> {
  constructor(
    protected override repository: VehicleRepository = new VehicleRepository(),
    private readonly storeRepository: StoreRepository = new StoreRepository(),
    private readonly modelRepository: ModelRepository = new ModelRepository(),
    private readonly featureRepository: FeatureRepository = new FeatureRepository()
  ) {
    super(repository);
  }

  private normalizePlate(plate: string): string {
    return plate.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  override async create(
    data: CreateVehicleData & { feature_ids?: string[] },
    featureIdsOverride?: string[],
    ctx?: TenantExecutionContext
  ): Promise<Vehicle> {
    const tenantId = ctx?.tenantId || (data as { tenant_id?: string }).tenant_id;
    if (!tenantId) {
      throw new BadRequestError('Tenant não identificado');
    }

    if (ctx?.userStoreId && data.store_id !== ctx.userStoreId) {
      throw new AppError('Usuário só tem permissão para operar veículos da sua própria filial', 403);
    }

    const store = await this.storeRepository.findByIdAndTenant(data.store_id, tenantId);
    if (!store) {
      throw new AppError('Loja informada não encontrada nesta empresa', 404);
    }

    const model = await this.modelRepository.findById(data.model_id, tenantId);
    if (!model) {
      throw new AppError('Modelo informado não encontrado nesta empresa', 404);
    }

    const featureIds = featureIdsOverride ?? data.feature_ids ?? [];
    const { feature_ids, ...cleanData } = data; //eslint-disable-line

    if (cleanData.full_license_plate) {
      cleanData.full_license_plate = this.normalizePlate(cleanData.full_license_plate);

      const existing = await this.repository.findByPlate(cleanData.full_license_plate, tenantId);
      if (existing) {
        throw new AppError('Placa já cadastrada para outro veículo ativo', 409);
      }
    }

    if (featureIds.length > 0) {
      const uniqueIds = Array.from(new Set(featureIds));
      const foundFeatures = await this.featureRepository.findByIdsForTenant(uniqueIds, tenantId);
      if (foundFeatures.length !== uniqueIds.length) {
        throw new AppError('Um ou mais opcionais informados não existem ou não pertencem à empresa', 404);
      }
    }

    const lastDigit = cleanData.full_license_plate
      ? Number(cleanData.full_license_plate.slice(-1))
      : 0;

    const payload: CreateVehicleData = {
      ...cleanData,
      tenant_id: tenantId,
      plate_last_digit: isNaN(lastDigit) ? 0 : lastDigit,
    };

    const vehicle = await this.repository.createWithFeatures(payload, featureIds);
    if (!vehicle) {
      throw new BadRequestError('Erro ao cadastrar veículo');
    }
    return vehicle;
  }

  override async update(
    id: string,
    data: Partial<CreateVehicleData> & { feature_ids?: string[] },
    featureIdsOverride?: unknown,
    ctxParam?: unknown
  ): Promise<Vehicle> {
    const featureIds = Array.isArray(featureIdsOverride)
      ? (featureIdsOverride as string[])
      : data.feature_ids;
    const ctx = (ctxParam ||
      (typeof featureIdsOverride === 'object' && !Array.isArray(featureIdsOverride)
        ? featureIdsOverride
        : undefined)) as TenantExecutionContext | undefined;

    const tenantId = ctx?.tenantId || (data as { tenant_id?: string }).tenant_id;
    if (!tenantId) {
      throw new BadRequestError('Tenant não identificado');
    }

    const cleanData = { ...data };
    delete cleanData.feature_ids;

    if (Object.keys(cleanData).length === 0 && featureIds === undefined) {
      throw new BadRequestError('Nenhum dado informado para atualização');
    }

    const currentVehicle = await this.repository.findById(id, tenantId);
    if (!currentVehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    if (ctx?.userStoreId && currentVehicle.store_id !== ctx.userStoreId) {
      throw new AppError('Usuário só tem permissão para operar veículos da sua própria filial', 403);
    }

    if (cleanData.store_id) {
      if (ctx?.userStoreId && cleanData.store_id !== ctx.userStoreId) {
        throw new AppError('Usuário só tem permissão para operar veículos da sua própria filial', 403);
      }
      if (cleanData.store_id !== currentVehicle.store_id) {
        const store = await this.storeRepository.findByIdAndTenant(cleanData.store_id, tenantId);
        if (!store) {
          throw new AppError('Loja informada não encontrada nesta empresa', 404);
        }
      }
    }

    if (cleanData.model_id && cleanData.model_id !== currentVehicle.model_id) {
      const model = await this.modelRepository.findById(cleanData.model_id, tenantId);
      if (!model) {
        throw new AppError('Modelo informado não encontrado nesta empresa', 404);
      }
    }

    if (cleanData.full_license_plate) {
      cleanData.full_license_plate = this.normalizePlate(cleanData.full_license_plate as string);

      const existing = await this.repository.findByPlate(cleanData.full_license_plate, tenantId);
      if (existing && existing.id !== id) {
        throw new AppError('Placa já cadastrada para outro veículo ativo', 409);
      }
      const lastDigit = Number(cleanData.full_license_plate.slice(-1));
      cleanData.plate_last_digit = isNaN(lastDigit) ? 0 : lastDigit;
    }

    if (featureIds && featureIds.length > 0) {
      const uniqueIds = Array.from(new Set(featureIds));
      const foundFeatures = await this.featureRepository.findByIdsForTenant(uniqueIds, tenantId);
      if (foundFeatures.length !== uniqueIds.length) {
        throw new AppError('Um ou mais opcionais informados não existem ou não pertencem à empresa', 404);
      }
    }

    const merged = { ...currentVehicle, ...cleanData };
    if (merged.sale_type === 'PROPRIO') {
      if (
        merged.purchase_price === undefined ||
        merged.purchase_price === null ||
        Number(merged.purchase_price) <= 0
      ) {
        throw new BadRequestError(
          'Preço de compra é obrigatório e deve ser maior que zero para veículos próprios'
        );
      }
    } else if (merged.sale_type === 'CONSIGNADO') {
      if (
        !merged.owner_name ||
        merged.owner_name.trim().length < 2 ||
        !merged.owner_contact ||
        merged.owner_contact.trim().length < 8 ||
        merged.owner_price === undefined ||
        merged.owner_price === null ||
        Number(merged.owner_price) <= 0 ||
        merged.store_commission_rate === undefined ||
        merged.store_commission_rate === null ||
        Number(merged.store_commission_rate) < 0
      ) {
        throw new BadRequestError(
          'Dados do proprietário, valor líquido e comissão são obrigatórios para veículos consignados'
        );
      }
    }

    const updated = await this.repository.updateWithFeatures(id, cleanData, featureIds, tenantId);
    if (!updated) {
      throw new NotFoundError('Veículo não encontrado');
    }
    return updated;
  }

  override async delete(id: string, tenantIdOrCtx?: unknown): Promise<Vehicle> {
    const tenantId =
      typeof tenantIdOrCtx === 'string'
        ? tenantIdOrCtx
        : (tenantIdOrCtx as TenantExecutionContext)?.tenantId;

    if (!tenantId) {
      throw new BadRequestError('Tenant não identificado');
    }

    const currentVehicle = await this.repository.findById(id, tenantId);
    if (!currentVehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    const userStoreId = (tenantIdOrCtx as TenantExecutionContext)?.userStoreId;
    if (userStoreId && currentVehicle.store_id !== userStoreId) {
      throw new AppError('Usuário só tem permissão para operar veículos da sua própria filial', 403);
    }

    const deleted = await this.repository.delete(id, tenantId);
    if (!deleted) {
      throw new NotFoundError('Veículo não encontrado');
    }
    return deleted;
  }

  async findPublic(
    query: Record<string, unknown>,
    ctx: TenantExecutionContext
  ): Promise<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filters = this.parseQueryFilters(query, true);
    filters.tenant_id = ctx.tenantId;
    filters.store_id = ctx.filterStoreId ?? undefined;

    const result = await this.repository.findCatalog(filters);

    return {
      ...result,
      items: result.items.map((item) => sanitizeVehicleForRole(item, 'PUBLICO')),
    };
  }

  async findAdmin(
    query: Record<string, unknown>,
    role: string,
    ctx: TenantExecutionContext
  ): Promise<{
    items: Record<string, unknown>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filters = this.parseQueryFilters(query, false);
    filters.tenant_id = ctx.tenantId;
    filters.store_id = ctx.userStoreId ?? ctx.filterStoreId ?? undefined;

    const result = await this.repository.findCatalog(filters);

    return {
      ...result,
      items: result.items.map((item) => sanitizeVehicleForRole(item, role)),
    };
  }

  async findByIdPublic(
    id: string,
    ip = '127.0.0.1',
    userAgent = 'unknown',
    ctx?: TenantExecutionContext
  ): Promise<Record<string, unknown>> {
    const detailed = await this.repository.findDetailedById(id, {
      publicOnly: true,
      tenant_id: ctx?.tenantId,
      store_id: ctx?.filterStoreId ?? undefined,
    });
    if (!detailed) {
      throw new NotFoundError('Veículo não encontrado');
    }

    viewTracker.trackView(id, ip, userAgent);

    const currentDetailed = {
      ...detailed,
      total_views: (detailed.total_views || 0) + viewTracker.getPendingViews(id),
    };

    return sanitizeVehicleForRole(currentDetailed, 'PUBLICO');
  }

  async findByIdAdmin(
    id: string,
    role: string,
    ctx: TenantExecutionContext
  ): Promise<Record<string, unknown>> {
    const detailed = await this.repository.findDetailedById(id, {
      publicOnly: false,
      tenant_id: ctx.tenantId,
      store_id: ctx.userStoreId ?? undefined,
    });
    if (!detailed) {
      throw new NotFoundError('Veículo não encontrado');
    }

    const currentDetailed = {
      ...detailed,
      total_views: (detailed.total_views || 0) + viewTracker.getPendingViews(id),
    };

    return sanitizeVehicleForRole(currentDetailed, role);
  }

  async comparePublic(
    ids: string[],
    ctx?: TenantExecutionContext
  ): Promise<Record<string, unknown>[]> {
    if (!Array.isArray(ids) || ids.length < 2 || ids.length > 3) {
      throw new BadRequestError('O comparador exige no mínimo 2 e no máximo 3 veículos');
    }

    const hasDuplicateIds = new Set(ids).size < ids.length;
    if (hasDuplicateIds) {
      throw new BadRequestError('Não é possível comparar o mesmo veículo. Seleciona veículos diferentes para comparar');
    }

    const vehicles = await this.repository.findByIds(ids, {
      publicOnly: true,
      tenant_id: ctx?.tenantId,
      store_id: ctx?.filterStoreId ?? undefined,
    });
    return vehicles.map((v) => sanitizeVehicleForRole(v, 'PUBLICO'));
  }

  async updateInspectionReport(
    id: string,
    reportUrl: string | null,
    ctx: TenantExecutionContext
  ): Promise<Vehicle | null> {
    const currentVehicle = await this.repository.findById(id, ctx.tenantId);
    if (!currentVehicle) {
      throw new NotFoundError('Veículo não encontrado');
    }

    if (ctx.userStoreId && currentVehicle.store_id !== ctx.userStoreId) {
      throw new AppError('Usuário só tem permissão para gerenciar mídias de veículos da sua própria filial', 403);
    }

    return await this.repository.updateInspectionReport(id, reportUrl, ctx.tenantId);
  }

  private parseQueryFilters(query: Record<string, unknown>, publicOnly: boolean): FindCatalogFilters {
    const featureIds =
      typeof query.feature_ids === 'string'
        ? query.feature_ids.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        : Array.isArray(query.feature_ids)
          ? (query.feature_ids as string[])
          : undefined;

    return {
      store_id: query.store_id as string | undefined,
      page: query.page ? Number(query.page) : undefined,
      limit: query.limit ? Number(query.limit) : undefined,
      category: query.category as string | undefined,
      brand_id: query.brand_id as string | undefined,
      model_id: query.model_id as string | undefined,
      fuel_type: query.fuel_type as string | undefined,
      transmission: query.transmission as string | undefined,
      min_price: query.min_price ? Number(query.min_price) : undefined,
      max_price: query.max_price ? Number(query.max_price) : undefined,
      min_year: query.min_year ? Number(query.min_year) : undefined,
      max_year: query.max_year ? Number(query.max_year) : undefined,
      max_mileage: query.max_mileage ? Number(query.max_mileage) : undefined,
      plate_last_digit:
        query.plate_last_digit !== undefined && query.plate_last_digit !== ''
          ? Number(query.plate_last_digit)
          : undefined,
      feature_ids: featureIds,
      status: query.status as string | undefined,
      search: query.search as string | undefined,
      include_deleted: publicOnly ? false : query.include_deleted === 'true',
      publicOnly,
    };
  }
}
