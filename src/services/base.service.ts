import BaseRepository, { FindData } from '#repositories/base.repository.js';
import { BadRequestError, NotFoundError } from '#src/errors/app.error.js';
import { QueryResultRow } from 'pg';

export default class BaseService<
    T extends QueryResultRow,
    C = Record<string, unknown>
> {
  constructor(protected repository: BaseRepository<T, C>) {}

  async findById(id: string, tenantId?: string): Promise<T> {
    const result = await this.repository.findById(id, tenantId);

    if (result === null) {
      throw new NotFoundError();
    }

    return result;
  }

  async find(filters: FindData = { filters: [] }, tenantId?: string): Promise<T[]> {
    const effectiveFilters: FindData = {
      ...filters,
      filters: [...(filters?.filters || [])],
    };

    if (tenantId && !effectiveFilters.filters.some((f) => f.field === 'tenant_id')) {
      effectiveFilters.filters.push({
        field: 'tenant_id',
        operator: '=',
        value: tenantId,
      });
    }

    return await this.repository.find(effectiveFilters);
  }

  async create(data: C): Promise<T> {
    const result = await this.repository.create(data);

    if (!result) {
      throw new BadRequestError('Erro ao criar registro');
    }

    return result;
  }

  async update(id: string, data: Partial<C>, tenantId?: unknown): Promise<T> {
    if (Object.keys(data).length === 0) {
      throw new BadRequestError('Nenhum dado informado');
    }

    const tenantIdStr = typeof tenantId === 'string' ? tenantId : undefined;
    const result = await this.repository.update(id, data, tenantIdStr);

    if (result === null) {
      throw new NotFoundError();
    }

    return result;
  }

  async delete(id: string, tenantId?: string): Promise<T> {
    const result = await this.repository.delete(id, tenantId);

    if (result === null) {
      throw new NotFoundError();
    }

    return result;
  }
}