import pool from '#src/config/database.js';
import BaseRepository, { FindData } from '#repositories/base.repository.js';

export interface Brand {
  id: string;
  tenant_id?: string | null;
  name: string;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
}

export interface CreateBrandData {
  tenant_id?: string | null;
  name: string;
}

export class BrandRepository extends BaseRepository<Brand, CreateBrandData> {
  protected override columns = [
    'id',
    'tenant_id',
    'name',
    'is_active',
    'deleted_at',
    'created_at',
  ];

  constructor() {
    super('brands');
  }

  async findForTenant(tenantId?: string | null, filters: FindData = { filters: [] }): Promise<Brand[]> {
    let query = `
      SELECT * FROM brands
      WHERE deleted_at IS NULL
    `;
    const values: unknown[] = [];

    if (tenantId) {
      values.push(tenantId);
      query += ` AND (tenant_id IS NULL OR tenant_id = $${values.length})`;
    } else {
      query += ' AND tenant_id IS NULL';
    }

    for (const filter of filters.filters || []) {
      if (filter.value === undefined || filter.value === null || filter.value === '') continue;
      if (filter.field === 'name' && filter.operator === 'ILIKE') {
        values.push(`%${filter.value}%`);
        query += ` AND name ILIKE $${values.length}`;
      } else if (filter.field === 'name' && filter.operator === '=') {
        values.push(filter.value);
        query += ` AND name = $${values.length}`;
      }
    }

    query += ' ORDER BY name ASC;';

    const result = await pool.query<Brand>(query, values);
    return result.rows;
  }

  async findByIdForTenant(id: string, tenantId?: string | null): Promise<Brand | null> {
    const query = `
      SELECT * FROM brands
      WHERE id = $1
        AND (tenant_id IS NULL OR tenant_id = $2)
        AND deleted_at IS NULL
      LIMIT 1;
    `;
    const result = await pool.query<Brand>(query, [id, tenantId ?? null]);
    return result.rows[0] || null;
  }

  async findByNameForTenant(name: string, tenantId?: string | null): Promise<Brand | null> {
    const query = `
      SELECT * FROM brands
      WHERE LOWER(name) = LOWER($1)
        AND (tenant_id IS NULL OR tenant_id = $2)
        AND deleted_at IS NULL
      LIMIT 1;
    `;
    const result = await pool.query<Brand>(query, [name, tenantId ?? null]);
    return result.rows[0] || null;
  }
}

export const brandRepository = new BrandRepository();
