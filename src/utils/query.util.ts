import { FindData } from '#repositories/base.repository.js';
import { BadRequestError } from '#src/errors/app.error.js';

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const IMMUTABLE_UPDATE_COLUMNS = new Set(['id', 'tenant_id', 'created_at']);

function assertValidIdentifier(identifier: string): void {
  if (!SAFE_IDENTIFIER_REGEX.test(identifier)) {
    throw new BadRequestError(`Identificador inválido: ${identifier}`);
  }
}

export function buildInsertQuery(tableName: string, data: Record<string, unknown>): { query: string; values: unknown[] } {
  assertValidIdentifier(tableName);
  const columns = Object.keys(data);
  columns.forEach(assertValidIdentifier);
  const values = Object.values(data);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *;`;
  return { query, values };
}

export function buildUpdateQuery(
  tableName: string,
  data: Record<string, unknown>,
  id: string,
  options?: { softDelete?: boolean; tenantId?: string }
): { query: string; values: unknown[] } {
  assertValidIdentifier(tableName);
  const mutableEntries = Object.entries(data).filter(
    ([key, value]) => !IMMUTABLE_UPDATE_COLUMNS.has(key) && value !== undefined
  );

  if (mutableEntries.length === 0) {
    throw new BadRequestError('Nenhum campo válido informado para atualização');
  }

  const columns = mutableEntries.map(([key]) => key);
  columns.forEach(assertValidIdentifier);
  const values = mutableEntries.map(([, value]) => value);
  const setClause = columns.map((column, index) => `${column} = $${index + 1}`).join(', ');
  const useSoftDelete = options?.softDelete !== false;
  const softDeleteClause = useSoftDelete ? ' AND deleted_at IS NULL' : '';
  const finalValues: unknown[] = [...values, id];
  let tenantClause = '';

  if (options?.tenantId) {
    tenantClause = ` AND tenant_id = $${finalValues.length + 1}`;
    finalValues.push(options.tenantId);
  }

  const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1}${tenantClause}${softDeleteClause} RETURNING *;`;

  return { query, values: finalValues };
}

export function buildFindQuery(
  tableName: string,
  filters: FindData,
  options?: { softDelete?: boolean }
): { query: string; values: unknown[] } {
  assertValidIdentifier(tableName);
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

    assertValidIdentifier(filter.field);

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