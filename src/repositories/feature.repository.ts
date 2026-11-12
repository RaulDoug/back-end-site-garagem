import BaseRepository, { FindData } from '#repositories/base.repository.js';
import pool from '#src/config/database.js';

export interface Feature {
  id: string;
  tenant_id: string | null;
  name: string;
}

export interface CreateFeatureData {
  name: string;
  tenant_id?: string | null;
}

export class FeatureRepository extends BaseRepository<Feature, CreateFeatureData> {
  protected override columns: (keyof Feature)[] = ['id', 'tenant_id', 'name'];

  constructor() {
    super('features', { softDelete: false, hasActiveStatus: false });
  }

  async findForTenant(tenantId?: string | null, filters?: FindData): Promise<Feature[]> {
    let query = `
      SELECT id, tenant_id, name
      FROM ${this.tableName}
      WHERE (tenant_id IS NULL ${tenantId ? 'OR tenant_id = $1' : ''})
    `;
    const params: unknown[] = tenantId ? [tenantId] : [];

    for (const filter of filters?.filters || []) {
      if (filter.value === undefined || filter.value === null || filter.value === '') continue;
      if (filter.field === 'name' && filter.operator === 'ILIKE') {
        params.push(`%${filter.value}%`);
        query += ` AND name ILIKE $${params.length}`;
      }
    }

    query += ' ORDER BY name ASC';

    const result = await pool.query<Feature>(query, params);
    return result.rows;
  }

  async findByIdForTenant(id: string, tenantId?: string | null): Promise<Feature | null> {
    const query = `
      SELECT id, tenant_id, name
      FROM ${this.tableName}
      WHERE id = $1
        AND (tenant_id IS NULL ${tenantId ? 'OR tenant_id = $2' : ''})
      LIMIT 1
    `;
    const params = tenantId ? [id, tenantId] : [id];
    const result = await pool.query<Feature>(query, params);
    return result.rows[0] || null;
  }

  async findByIdsForTenant(ids: string[], tenantId?: string | null): Promise<Feature[]> {
    if (!ids || ids.length === 0) return [];

    const query = `
      SELECT id, tenant_id, name
      FROM ${this.tableName}
      WHERE id = ANY($1::uuid[])
        AND (tenant_id IS NULL ${tenantId ? 'OR tenant_id = $2' : ''})
    `;
    const params = tenantId ? [ids, tenantId] : [ids];
    const result = await pool.query<Feature>(query, params);
    return result.rows;
  }

  async findByNameForTenant(name: string, tenantId?: string | null): Promise<Feature | null> {
    const query = `
      SELECT id, tenant_id, name
      FROM ${this.tableName}
      WHERE lower(name) = lower($1)
        AND (tenant_id IS NULL ${tenantId ? 'OR tenant_id = $2' : ''})
      LIMIT 1
    `;
    const params = tenantId ? [name, tenantId] : [name];
    const result = await pool.query<Feature>(query, params);
    return result.rows[0] || null;
  }
}

export const featureRepository = new FeatureRepository();
