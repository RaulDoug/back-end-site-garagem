import BaseRepository from '#repositories/base.repository.js';
import pool from '#src/config/database.js';

export interface Model {
  id: string;
  tenant_id: string;
  brand_id: string;
  name: string;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
}

export interface CreateModelData {
  tenant_id: string;
  brand_id: string;
  name: string;
  is_active?: boolean;
}

export class ModelRepository extends BaseRepository<Model, CreateModelData> {
  protected override columns: (keyof Model)[] = [
    'id',
    'tenant_id',
    'brand_id',
    'name',
    'is_active',
    'deleted_at',
    'created_at',
  ];

  constructor() {
    super('models');
  }

  async findByNameAndBrand(name: string, brandId: string, tenantId: string): Promise<Model | null> {
    const query = `
      SELECT ${this.columns.join(', ')}
      FROM ${this.tableName}
      WHERE tenant_id = $1
        AND brand_id = $2
        AND lower(name) = lower($3)
        AND deleted_at IS NULL
      LIMIT 1
    `;
    const result = await pool.query<Model>(query, [tenantId, brandId, name]);
    return result.rows[0] || null;
  }

  async findByBrandId(brandId: string, tenantId: string): Promise<Model[]> {
    const query = `
      SELECT ${this.columns.join(', ')}
      FROM ${this.tableName}
      WHERE tenant_id = $1
        AND brand_id = $2
        AND deleted_at IS NULL
      ORDER BY name ASC
    `;
    const result = await pool.query<Model>(query, [tenantId, brandId]);
    return result.rows;
  }
}

export const modelRepository = new ModelRepository();
