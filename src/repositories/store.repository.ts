import type { Pool } from 'pg';
import pool from '#src/config/database.js';
import BaseRepository from '#repositories/base.repository.js';

export interface Store {
  id: string;
  tenant_id: string;
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
  tenant_id?: string;
  name: string;
  phone: string;
  cnpj: string;
  zip_code: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  complement?: string | null;
}

export class StoreRepository extends BaseRepository<Store, CreateStoreData> {
  protected override columns = [
    'id',
    'tenant_id',
    'name',
    'phone',
    'zip_code',
    'street',
    'number',
    'neighborhood',
    'city',
    'state',
    'complement',
    'cnpj',
    'is_active',
    'deleted_at',
    'created_at',
  ];

  constructor(customPool: Pool = pool) {
    super('stores', {}, customPool);
  }

  async findByCNPJ(cnpj: string): Promise<Store | null> {
    const query = 'SELECT * FROM stores WHERE cnpj = $1 AND deleted_at IS NULL LIMIT 1;';
    const result = await this.pool.query<Store>(query, [cnpj]);

    return result.rows[0] || null;
  }

  async findByIdAndTenant(id: string, tenantId: string): Promise<Store | null> {
    const query = 'SELECT * FROM stores WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1;';
    const result = await this.pool.query<Store>(query, [id, tenantId]);

    return result.rows[0] || null;
  }

  async hasActiveDependencies(id: string, tenantId: string): Promise<boolean> {
    const query = `
      SELECT (
        EXISTS(SELECT 1 FROM users WHERE store_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)
        OR EXISTS(SELECT 1 FROM vehicles WHERE store_id = $1 AND tenant_id = $2 AND deleted_at IS NULL)
      ) AS has_deps;
    `;
    const result = await this.pool.query<{ has_deps: boolean }>(query, [id, tenantId]);

    return Boolean(result.rows[0]?.has_deps);
  }
}

export const storeRepository = new StoreRepository();
