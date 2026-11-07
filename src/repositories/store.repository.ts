import pool from '#src/config/database.js';
import BaseRepository from '#repositories/base.repository.js';

export interface Store {
    id: string;
    name: string;
    phone: string;
    zip_code: string;
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    cnpj: string;
    is_active: boolean;
    deleted_at: Date | null;
    created_at: Date;
}

export interface CreateStoreData {
    name: string;
    phone: string;
    cnpj: string;
    zip_code: string;
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    complement?: string;
}

export class StoreRepository extends BaseRepository<Store, CreateStoreData> {
  constructor() {
    super('stores');
  }

  async findByCNPJ(cnpj: string): Promise<Store | null> {
    const query = 'SELECT * FROM stores WHERE cnpj = $1 AND deleted_at IS NULL LIMIT 1;';
    const result = await pool.query<Store>(query, [cnpj]);

    return result.rows[0] || null;
  }
}