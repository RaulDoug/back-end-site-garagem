import type { FindData } from '#repositories/base.repository.js';
import { BadRequestError } from '#src/errors/app.error.js';

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const IMMUTABLE_UPDATE_COLUMNS = new Set(['id', 'tenant_id', 'created_at']);
const ALLOWED_FIND_OPERATORS = new Set(['=', '>=', '<=', 'ILIKE', 'IN']);

export interface BuildFindQueryOptions {
  softDelete?: boolean;
  tenantId?: string;
  columns?: string[];
  orderBy?: { field: string; direction?: 'ASC' | 'DESC' };
  limit?: number;
}

function assertValidIdentifier(identifier: string): void {
  if (!SAFE_IDENTIFIER_REGEX.test(identifier)) {
    throw new BadRequestError(`Identificador inválido: ${identifier}`);
  }
}

export function buildInsertQuery(tableName: string, data: Record<string, unknown>): { query: string; values: unknown[] } {
  assertValidIdentifier(tableName);
  const validEntries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (validEntries.length === 0) {
    throw new BadRequestError('Nenhum campo válido informado para inserção');
  }
  const columns = validEntries.map(([key]) => key);
  columns.forEach(assertValidIdentifier);
  const values = validEntries.map(([, value]) => value);
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

  if (options?.tenantId !== undefined) {
    if (typeof options.tenantId !== 'string' || options.tenantId.trim() === '') {
      throw new BadRequestError('Identificador de tenant inválido');
    }
    tenantClause = ` AND tenant_id = $${finalValues.length + 1}`;
    finalValues.push(options.tenantId);
  }

  const query = `UPDATE ${tableName} SET ${setClause} WHERE id = $${columns.length + 1}${tenantClause}${softDeleteClause} RETURNING *;`;

  return { query, values: finalValues };
}

export function buildFindQuery(
  tableName: string,
  filters: FindData,
  options?: BuildFindQueryOptions
): { query: string; values: unknown[] } {
  assertValidIdentifier(tableName);
  const { filters: filterArray, includeDeleted } = filters;

  let selectedColumns = '*';
  if (options?.columns !== undefined) {
    if (!Array.isArray(options.columns) || options.columns.length === 0) {
      throw new BadRequestError('A lista de colunas para seleção não pode ser vazia');
    }
    options.columns.forEach(assertValidIdentifier);
    selectedColumns = options.columns.join(', ');
  }

  let query = `SELECT ${selectedColumns} FROM ${tableName}`;
  const values: unknown[] = [];
  const conditions: string[] = [];

  const useSoftDelete = options?.softDelete !== false;
  if (useSoftDelete && !includeDeleted) {
    conditions.push('deleted_at IS NULL');
  }

  if (options?.tenantId !== undefined) {
    if (typeof options.tenantId !== 'string' || options.tenantId.trim() === '') {
      throw new BadRequestError('Identificador de tenant inválido');
    }
    values.push(options.tenantId);
    conditions.push(`tenant_id = $${values.length}`);
  }

  for (const filter of filterArray) {
    if (options?.tenantId !== undefined && filter.field === 'tenant_id') {
      continue;
    }
    if (
      filter.value === undefined ||
      filter.value === null ||
      (typeof filter.value === 'string' && filter.value.trim() === '') ||
      (Array.isArray(filter.value) && filter.value.length === 0)
    ) {
      continue;
    }

    assertValidIdentifier(filter.field);

    if (!ALLOWED_FIND_OPERATORS.has(filter.operator)) {
      throw new BadRequestError(`Operador inválido: ${String(filter.operator)}`);
    }

    if (filter.operator === 'IN') {
      if (!Array.isArray(filter.value)) {
        throw new BadRequestError('O operador IN exige um array de valores');
      }
      values.push(filter.value);
      conditions.push(`${filter.field} = ANY($${values.length})`);
    } else if (filter.operator === 'ILIKE') {
      values.push(`%${filter.value}%`);
      conditions.push(`${filter.field} ILIKE $${values.length}`);
    } else {
      values.push(filter.value);
      conditions.push(`${filter.field} ${filter.operator} $${values.length}`);
    }
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  if (options?.orderBy !== undefined) {
    assertValidIdentifier(options.orderBy.field);
    const direction = options.orderBy.direction ?? 'ASC';
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new BadRequestError(`Direção de ordenação inválida: ${String(direction)}`);
    }
    query += ` ORDER BY ${options.orderBy.field} ${direction}`;
  }

  if (options?.limit !== undefined) {
    if (
      typeof options.limit !== 'number' ||
      !Number.isInteger(options.limit) ||
      options.limit <= 0
    ) {
      throw new BadRequestError('O limite deve ser um número inteiro positivo');
    }
    values.push(options.limit);
    query += ` LIMIT $${values.length}`;
  }

  return { query, values };
}