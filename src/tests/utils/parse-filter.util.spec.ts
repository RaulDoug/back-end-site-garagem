import { describe, expect, it } from 'vitest';
import { parseFilters } from '#utils/parse-filter.util.js';

describe('parseFilters util', () => {
  it('deve retornar filters vazio quando a query for vazia', () => {
    const result = parseFilters({});

    expect(result).toEqual({
      filters: [],
    });
  });

  describe('tratamento de include_deleted', () => {
    it('deve definir includeDeleted: true quando include_deleted for "true"', () => {
      const result = parseFilters({ include_deleted: 'true' });

      expect(result).toEqual({
        filters: [],
        includeDeleted: true,
      });
    });

    it('não deve incluir include_deleted no array de filtros', () => {
      const result = parseFilters({ include_deleted: 'false' });

      expect(result.filters).toEqual([]);
      expect(result.includeDeleted).toBeFalsy();
    });
  });

  describe('operador de igualdade (=)', () => {
    it('deve mapear campo sem sufixo para o operador "="', () => {
      const result = parseFilters({ role: 'ADMIN' });

      expect(result.filters).toEqual([
        {
          field: 'role',
          operator: '=',
          value: 'ADMIN',
        },
      ]);
    });
  });

  describe('operador ILIKE (_like)', () => {
    it('deve remover o sufixo _like e usar o operador "ILIKE"', () => {
      const result = parseFilters({ name_like: 'civic' });

      expect(result.filters).toEqual([
        {
          field: 'name',
          operator: 'ILIKE',
          value: 'civic',
        },
      ]);
    });
  });

  describe('operadores de comparação (>= e <=)', () => {
    it('deve remover o sufixo _gte e usar o operador ">="', () => {
      const result = parseFilters({ price_gte: '50000' });

      expect(result.filters).toEqual([
        {
          field: 'price',
          operator: '>=',
          value: '50000',
        },
      ]);
    });

    it('deve remover o sufixo _lte e usar o operador "<="', () => {
      const result = parseFilters({ created_at_lte: '2026-12-31' });

      expect(result.filters).toEqual([
        {
          field: 'created_at',
          operator: '<=',
          value: '2026-12-31',
        },
      ]);
    });
  });

  describe('operador IN (valores separados por vírgula)', () => {
    it('deve converter string com vírgula em array e usar operador "IN"', () => {
      const result = parseFilters({ status: 'ATIVO,PENDENTE' });

      expect(result.filters).toEqual([
        {
          field: 'status',
          operator: 'IN',
          value: ['ATIVO', 'PENDENTE'],
        },
      ]);
    });

    it('deve remover espaços em branco dos itens da lista com vírgula', () => {
      const result = parseFilters({ role: 'ADMIN, VENDEDOR' });

      expect(result.filters).toEqual([
        {
          field: 'role',
          operator: 'IN',
          value: ['ADMIN', 'VENDEDOR'],
        },
      ]);
    });
  });

  describe('limpeza e casos de borda', () => {
    it('deve ignorar valores nulos, indefinidos ou strings vazias', () => {
      const result = parseFilters({
        name: '',
        search: undefined,
        tag: null,
        status: 'ATIVO',
      });

      expect(result.filters).toEqual([
        {
          field: 'status',
          operator: '=',
          value: 'ATIVO',
        },
      ]);
    });

    it('deve combinar múltiplos tipos de filtros e include_deleted corretamente', () => {
      const result = parseFilters({
        name_like: 'Gol',
        price_gte: '20000',
        role: 'ADMIN,VENDEDOR',
        is_active: 'true',
        include_deleted: 'true',
      });

      expect(result.includeDeleted).toBe(true);
      expect(result.filters).toEqual([
        { field: 'name', operator: 'ILIKE', value: 'Gol' },
        { field: 'price', operator: '>=', value: '20000' },
        { field: 'role', operator: 'IN', value: ['ADMIN', 'VENDEDOR'] },
        { field: 'is_active', operator: '=', value: 'true' },
      ]);
    });
  });
});

