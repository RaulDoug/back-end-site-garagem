import { BaseRepository } from '#repositories/base.repository.js';
import type { QueryResultRow } from 'pg';

export abstract class BaseService<T extends QueryResultRow> {
  constructor(protected readonly repository: BaseRepository<T>) { };

  async findById(id: string): Promise<T | null> {
    return this.repository.findById(id);
  }

  async find(data: Record<string, unknown> = {}): Promise<T[]> {
    return this.repository.find(data);
  }

  async delete(id: string): Promise<T | null> {
    return this.repository.delete(id);
  }
}