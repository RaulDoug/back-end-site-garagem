import { FindData } from '#repositories/base.repository.js';

export function buildInsertQuery(tableName: string, data: Record<string, unknown>): { query: string; values: unknown[] } {
  const columns = Object.keys(data);
  const values = Object.values(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *;`;
  return { query, values };
}

export function buildUpdateQuery(tableName: string, data: Record<string, unknown>, id: string): { query: string; values: unknown[] }{
  const columns = Object.keys(data);
  const values = Object.values(data);
  const setClause = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
  const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1} RETURNING *;`;

  return { query, values: [...values, id] };
}

export function buildFindQuery(
  tableName: string,
  filters: FindData,
  options?: { softDelete?: boolean }
): { query: string; values: unknown[] } {
  const { filters: filterArray, includeDeleted } = filters;

  let query = `SELECT * FROM ${tableName}`;
  const values: unknown[] = [];
  const conditions: string[] = [];

  const useSoftDelete = options?.softDelete !== false;
  if (useSoftDelete && !includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  for (const filter of filterArray) {
    if (filter.value === undefined || filter.value === null || (typeof filter.value === 'string' && filter.value.trim() === '') || Array.isArray(filter.value) && filter.value.length === 0) {
      continue;
    }

    if (filter.operator === 'IN' && Array.isArray(filter.value)) {
      values.push(filter.value);

      conditions.push(`${filter.field} = ANY($${values.length})`);
    }else if (filter.operator === 'ILIKE') {
      values.push(`%${filter.value}%`);

      conditions.push(`${filter.field} ILIKE $${values.length}`);
    }else {
      values.push(filter.value);

      conditions.push(`${filter.field} ${filter.operator} $${values.length}`);
    }        
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  return { query, values };
}