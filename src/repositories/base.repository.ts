import { buildFindQuery, buildInsertQuery, buildUpdateQuery } from '#utils/query.util.js';
import pool from '#src/config/database.js';
import { QueryResultRow } from 'pg';

interface RepositoryOptions {
    softDelete?: boolean;
    hasActiveStatus?: boolean;
}

export interface FindParams {
    field: string;
    value: unknown;
    operator: '=' | '>=' | '<=' | 'ILIKE' | 'IN';
}

export interface FindData {
    filters: FindParams[];
    includeDeleted?: boolean;
}

export default class BaseRepository<
    T extends QueryResultRow,
    C = Record<string, unknown>
> {
  protected columns: string[] = [];

  constructor(
        protected tableName: string,
        protected options: RepositoryOptions = { softDelete: true, hasActiveStatus: true }
  ) {
    this.options = { softDelete: true, hasActiveStatus: true, ...options };
  }

  async findById(id: string, tenantId?: string): Promise<T | null> {
    let query = `
            SELECT * FROM ${this.tableName} 
            WHERE id = $1
        `;
    const values: unknown[] = [id];

    if (tenantId && this.columns.includes('tenant_id')) {
      query += ` AND tenant_id = $${values.length + 1}`;
      values.push(tenantId);
    }

    if (this.options.softDelete) {
      query += ' AND deleted_at IS NULL LIMIT 1;';
    } else {
      query += ' LIMIT 1;';
    }

    const result = await pool.query<T>(query, values);

    return result.rows[0] || null;
  }

  async find(filters: FindData, tenantId?: string): Promise<T[]> {
    const findOptions = {
      ...this.options,
      ...(tenantId !== undefined && this.columns.includes('tenant_id') ? { tenantId } : {}),
    };
    const { query, values } = buildFindQuery(this.tableName, filters, findOptions);

    const result = await pool.query<T>(query, values);

    return result.rows;
  }

  async create(data: C): Promise<T> {
    const { query, values } = buildInsertQuery(this.tableName, data as Record<string, unknown>);

    const result = await pool.query<T>(query, values);

    return result.rows[0];
  }

  async update(id: string, data: Partial<C>, tenantId?: string): Promise<T | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return null;

    const updateOptions = {
      ...this.options,
      ...(tenantId !== undefined && this.columns.includes('tenant_id') ? { tenantId } : {}),
    };

    const { query, values } = buildUpdateQuery(this.tableName, data as Record<string, unknown>, id, updateOptions);

    const result = await pool.query<T>(query, values);

    return result.rows[0] || null;
  }

  async delete(id: string, tenantId?: string): Promise<T | null> {
    let query: string;
    const values: unknown[] = [id];

    let tenantClause = '';
    if (tenantId && this.columns.includes('tenant_id')) {
      tenantClause = ` AND tenant_id = $${values.length + 1}`;
      values.push(tenantId);
    }

    if (this.options.softDelete) {
      const activeClause = this.options.hasActiveStatus ? ', is_active = false' : '';
      query = `
                UPDATE ${this.tableName}
                SET deleted_at = NOW()${activeClause}
                WHERE id = $1${tenantClause} 
                AND deleted_at IS NULL 
                RETURNING *;
            `;
    } else {
      query = `DELETE FROM ${this.tableName} WHERE id = $1${tenantClause} RETURNING *;`;
    }

    const result = await pool.query<T>(query, values);

    return result.rows[0] || null;
  }
}
