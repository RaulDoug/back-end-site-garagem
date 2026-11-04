import BaseRepository, { FindData } from '#repositories/base.repository.js';
import { BadRequestError, NotFoundError } from '#src/errors/app.error.js';
import { QueryResultRow } from 'pg';

export default class BaseService<
    T extends QueryResultRow,
    C = Record<string, unknown>
> {
  constructor(protected repository: BaseRepository<T, C>) {}

  async findById(id: string): Promise<T> {
    const result = await this.repository.findById(id);

    if (result === null) {
      throw new NotFoundError();
    }

    return result;
  }

  async find(filters: FindData): Promise<T[]> {
    return await this.repository.find(filters);
  }

  async create(data: C): Promise<T> {
    const result = await this.repository.create(data);

    if (!result) {
      throw new BadRequestError('Erro ao criar registro');
    }

    return result;
  }

  async update(id: string, data: Partial<C>): Promise<T> {
    if (Object.keys(data).length === 0) {
      throw new BadRequestError('Nenhum dado informado');
    }

    const result = await this.repository.update(id, data);

    if (result === null) {
      throw new NotFoundError();
    }

    return result;
  }

  async delete(id: string): Promise<T> {
    const result = await this.repository.delete(id);

    if (result === null) {
      throw new NotFoundError();
    }

    return result;
  }
}