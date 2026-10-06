import type { PoolClient, QueryResultRow } from 'pg';
import pool from '#src/config/database.js';
import { queryParamsBuilder } from '#utils/query.util.js';

export abstract class BaseRepository<T extends QueryResultRow> {
  constructor(protected readonly tableName: string) { };

  async create(data: Record<string, unknown>, client?: PoolClient): Promise<T> {
    const db = client ?? pool;

    const { columns, placeholders, values } = queryParamsBuilder(data);

    const query = `
      INSERT INTO ${this.tableName} (${columns})
      VALUES (${placeholders})
      RETURNING *;
    `;

    const result = await db.query<T>(query, values);

    return result.rows[0];
  }

  async update(id: string, data: Record<string, unknown>, client?: PoolClient): Promise<T | null> {
    const db = client ?? pool;

    const { keys, values, setClause } = queryParamsBuilder(data);

    if (keys.length === 0) return null;

    const idIndex = keys.length + 1;

    const query = `
          UPDATE ${this.tableName}
          SET ${setClause}
          WHERE id = $${idIndex}
          RETURNING *;
        `;

    const result = await db.query<T>(query, [...values, id]);

    return result.rows[0] || null;
  }

  async delete(id: string, client?: PoolClient): Promise<T | null> {
    const db = client ?? pool;

    const query = `
      DELETE FROM ${this.tableName}
      WHERE id = $1
      RETURNING *;
    `;

    const result = await db.query<T>(query, [id]);

    return result.rows[0] || null;
  }

  async find(data: Record<string, unknown>, client?: PoolClient): Promise<T[]> {
    const db = client ?? pool;

    const { whereClause, values, keys } = queryParamsBuilder(data);

    const whereCodition = keys.length > 0 ? `WHERE ${whereClause}` : '';

    const query = `
      SELECT * FROM ${this.tableName}
      ${whereCodition};
    `;

    const result = await db.query<T>(query, values);

    return result.rows;
  }

  async findById(id: string, client?: PoolClient): Promise<T | null> {
    const db = client ?? pool;

    const query = `
      SELECT * FROM ${this.tableName}
      WHERE id = $1
      LIMIT 1;
    `;

    const result = await db.query<T>(query, [id]);

    return result.rows[0] || null;
  }
}