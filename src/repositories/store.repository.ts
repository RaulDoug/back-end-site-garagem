import { PoolClient } from 'pg';
import { BaseRepository } from './base.repository';
import pool from '#src/config/database.js';

export interface Store {
  id: string;
  name: string;
  phone: string;
  address: string;
  cnpj: string;
  is_active: boolean;
  created_at: Date;
}

export class StoreRepository extends BaseRepository<Store> {
  constructor() {
    super('stores');
  }

  async findCnpj(cnpj: string, client?: PoolClient): Promise<Pick<Store, 'cnpj'> | null> {
    const db = client ?? pool;

    const cnpjSearch = await db.query<Pick<Store, 'cnpj'>>(
      'SELECT cnpj FROM stores WHERE cnpj = $1',
      [cnpj],
    );

    return cnpjSearch.rows[0] || null;
  }
}

export const storeRepository = new StoreRepository();