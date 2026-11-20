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
    return await this.repository.find(filters, tenantId);
  }

  async create(data: C): Promise<T> {
    const result = await this.repository.create(data);

    if (!result) {
      throw new BadRequestError('Erro ao criar registro');
    }

    return result;
  }

  async update(id: string, data: Partial<C>, tenantId?: string): Promise<T> {
    if (!Object.values(data).some((v) => v !== undefined)) {
      throw new BadRequestError('Nenhum dado informado');
    }

    const result = await this.repository.update(id, data, tenantId);

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