import pool from '#src/config/database.js';
import BaseRepository from '#repositories/base.repository.js';
import type { Store } from '#repositories/store.repository.js';
import type { User } from '#repositories/user.repository.js';
import type { Pool } from 'pg';

export interface Tenant {
  id: string;
  corporate_name: string;
  trade_name: string;
  cnpj: string;
  is_active: boolean;
  created_at: Date;
  deleted_at?: Date | null;
}

export interface CreateTenantData {
  corporate_name: string;
  trade_name: string;
  cnpj: string;
  is_active?: boolean;
}

export type UpdateTenantData = Partial<CreateTenantData>;

export interface OnboardTenantDbInput {
  tenant: CreateTenantData;
  store: {
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
  };
  admin: {
    name: string;
    email: string;
    password_hash: string;
    phone: string;
    cpf?: string;
    birth_date?: string | null;
  };
}

export class TenantRepository extends BaseRepository<Tenant, CreateTenantData> {
  protected pool: Pool;

  constructor(customPool: Pool = pool) {
    super('tenants', { softDelete: true, hasActiveStatus: true });
    this.pool = customPool;
  }

  async findByCNPJ(cnpj: string): Promise<Tenant | null> {
    const query = `
      SELECT * FROM tenants 
      WHERE (cnpj = $1 OR regexp_replace(cnpj, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g'))
        AND deleted_at IS NULL 
      LIMIT 1;
    `;
    const result = await this.pool.query<Tenant>(query, [cnpj]);
    return result.rows[0] || null;
  }

  async onboardTenant(input: OnboardTenantDbInput): Promise<{
    tenant: Tenant;
    store: Store;
    admin: Omit<User, 'password_hash'>;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const tenantQuery = `
        INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
        VALUES ($1, $2, $3, COALESCE($4, true))
        RETURNING *;
      `;
      const tenantRes = await client.query<Tenant>(tenantQuery, [
        input.tenant.corporate_name,
        input.tenant.trade_name,
        input.tenant.cnpj,
        input.tenant.is_active ?? true,
      ]);
      const tenant = tenantRes.rows[0];

      const storeQuery = `
        INSERT INTO stores (
          tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state, complement, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
        RETURNING *;
      `;
      const storeRes = await client.query<Store>(storeQuery, [
        tenant.id,
        input.store.name,
        input.store.phone,
        input.store.cnpj,
        input.store.zip_code,
        input.store.street,
        input.store.number,
        input.store.neighborhood,
        input.store.city,
        input.store.state,
        input.store.complement ?? null,
      ]);
      const store = storeRes.rows[0];

      const adminQuery = `
        INSERT INTO users (
          tenant_id, store_id, name, email, password_hash, phone, role, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'ADMIN', true)
        RETURNING id, tenant_id, store_id, name, email, phone, role, commission_rates, is_active, created_at, deleted_at;
      `;
      const adminRes = await client.query<Omit<User, 'password_hash'>>(adminQuery, [
        tenant.id,
        store.id,
        input.admin.name,
        input.admin.email,
        input.admin.password_hash,
        input.admin.phone,
      ]);
      const admin = adminRes.rows[0];

      await client.query('COMMIT');
      return { tenant, store, admin };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const tenantRepository = new TenantRepository();
