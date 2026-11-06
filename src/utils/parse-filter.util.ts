import { FindData, FindParams } from '#repositories/base.repository.js';

export function parseFilters(query: Record<string, unknown>): FindData {
  const filters: FindParams[] = [];

  // tratamento de include_deleted
  const includeDeleted = query.include_deleted === 'true';

  // Percorre cada chave-valor do objeto query
  for (const [key, rawValue] of Object.entries(query)) {
    if (
      key === 'include_deleted' ||
      key === 'page' ||
      key === 'limit' ||
      rawValue === undefined ||
      rawValue === null ||
      rawValue === ''
    ) {
      continue;
    };

    // Define as variáveis do filtro atual
    let field = key;
    let operator: FindParams['operator'] = '=';
    let value: unknown = rawValue;

    // Indentificar o operador com base no sufixo do campo
    if (key.endsWith('_like')) {
      field = key.replace(/_like$/, '');
      operator = 'ILIKE';
    } else if (key.endsWith('_gte')) {
      field = key.replace(/_gte$/, '');
      operator = '>=';
    } else if (key.endsWith('_lte')) {
      field = key.replace(/_lte$/, '');
      operator = '<=';
    } else if (typeof rawValue === 'string' && rawValue.includes(',')) {
      operator = 'IN';
      value = rawValue.split(',').map((v) => v.trim());
    }

    // Adiciona o filtro ao array de filtros
    filters.push({ field, operator, value });
  }

  return includeDeleted ? { filters, includeDeleted } : { filters };
}