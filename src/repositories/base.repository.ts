import { buildFindQuery, buildInsertQuery, buildUpdateQuery } from '#utils/query.util.js';
import pool from '../config/database';
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
  constructor(
        protected tableName: string,
        protected options: RepositoryOptions = { softDelete: true, hasActiveStatus: true }
  ) {
    this.options = { softDelete: true, hasActiveStatus: true, ...options };
  }

  async findById(id: string): Promise<T | null> {
    let query = `
            SELECT * FROM ${this.tableName} 
            WHERE id = $1
        `;

    if (this.options.softDelete) {
      query += ' AND deleted_at IS NULL LIMIT 1;';
    } else {
      query += ' LIMIT 1;';
    }

    const result = await pool.query<T>(query, [id]);

    return result.rows[0] || null;
  }

  async find(filters: FindData): Promise<T[]> {
    const { query, values } = buildFindQuery(this.tableName, filters, this.options);

    const result = await pool.query<T>(query, values);

    return result.rows;
  }

  async create(data: C): Promise<T> {
    const { query, values } = buildInsertQuery(this.tableName, data as Record<string, unknown>);

    const result = await pool.query<T>(query, values);

    return result.rows[0];
  }

  async update(id: string, data: Partial<C>): Promise<T | null> {
    const keys = Object.keys(data);
    if (keys.length === 0) return null;

    const { query, values } = buildUpdateQuery(this.tableName, data as Record<string, unknown>, id);

    const result = await pool.query<T>(query, values);

    return result.rows[0] || null;
  }

  async delete(id: string): Promise<T | null> {
    let query: string;

    if (this.options.softDelete) {
      const activeClause = this.options.hasActiveStatus ? ', is_active = false' : '';
      query = `
                UPDATE ${this.tableName}
                SET deleted_at = NOW()${activeClause}
                WHERE id = $1 
                AND deleted_at IS NULL 
                RETURNING *;
            `;
    } else {
      query = `DELETE FROM ${this.tableName} WHERE id = $1 RETURNING *;`;
    }

    const result = await pool.query<T>(query, [id]);

    return result.rows[0] || null;
  }
}
