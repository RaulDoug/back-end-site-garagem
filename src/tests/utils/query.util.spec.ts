import { describe, it, expect } from 'vitest';
import { buildInsertQuery, buildUpdateQuery, buildFindQuery } from '#src/utils/query.util.js';
import { BadRequestError } from '#src/errors/app.error.js';

describe('query.util - buildInsertQuery', () => {
  it('deve montar INSERT ignorando campos com valor undefined e preservando null', () => {
    const result = buildInsertQuery('brands', { name: 'Toyota', notes: undefined, deleted_at: null });
    expect(result.query).toBe('INSERT INTO brands (name, deleted_at) VALUES ($1, $2) RETURNING *;');
    expect(result.values).toEqual(['Toyota', null]);
  });

  it('deve lançar BadRequestError quando data for vazio ou contiver apenas valores undefined', () => {
    expect(() => buildInsertQuery('brands', {})).toThrow(BadRequestError);
    expect(() => buildInsertQuery('brands', {})).toThrow('Nenhum campo válido informado para inserção');
    expect(() => buildInsertQuery('brands', { name: undefined })).toThrow(BadRequestError);
    expect(() => buildInsertQuery('brands', { name: undefined })).toThrow('Nenhum campo válido informado para inserção');
  });

  it('deve lançar BadRequestError quando tableName ou coluna contiver identificador inválido', () => {
    expect(() => buildInsertQuery('brands; DROP TABLE users', { name: 'X' })).toThrow(BadRequestError);
    expect(() => buildInsertQuery('brands', { 'name; --': 'X' })).toThrow(BadRequestError);
  });
});

describe('query.util - buildUpdateQuery', () => {
  it('deve montar SET ignorando id, tenant_id, created_at e campos com valor undefined', () => {
    const data = {
      id: 'should-ignore-id',
      tenant_id: 'should-ignore-tenant',
      created_at: new Date(),
      name: 'Nome Atualizado',
      description: undefined,
      is_active: false,
    };

    const result = buildUpdateQuery('stores', data, 'target-uuid-1');

    expect(result.query).toBe(
      'UPDATE stores SET name = $1, is_active = $2 WHERE id = $3 AND deleted_at IS NULL RETURNING *;'
    );
    expect(result.values).toEqual(['Nome Atualizado', false, 'target-uuid-1']);
  });

  it('deve manter WHERE id = $n AND tenant_id = $(n+1) AND deleted_at IS NULL quando options.tenantId for informado', () => {
    const data = {
      name: 'Loja Filial',
      tenant_id: 'malicious-overwrite',
    };

    const result = buildUpdateQuery('stores', data, 'target-uuid-1', {
      tenantId: 'safe-tenant-uuid',
    });

    expect(result.query).toBe(
      'UPDATE stores SET name = $1 WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL RETURNING *;'
    );
    expect(result.values).toEqual(['Loja Filial', 'target-uuid-1', 'safe-tenant-uuid']);
  });

  it('deve lançar BadRequestError quando nenhum campo mutável válido restar após a filtragem', () => {
    const data = {
      id: 'target-uuid-1',
      tenant_id: 'tenant-123',
      created_at: new Date(),
      phone: undefined,
    };

    expect(() => buildUpdateQuery('stores', data, 'target-uuid-1')).toThrow(BadRequestError);
  });

  it('deve lançar BadRequestError quando options.tenantId for string vazia ou apenas espaços', () => {
    expect(() =>
      buildUpdateQuery('stores', { name: 'Loja' }, 'id-1', { tenantId: '' })
    ).toThrow(BadRequestError);
    expect(() =>
      buildUpdateQuery('stores', { name: 'Loja' }, 'id-1', { tenantId: '' })
    ).toThrow('Identificador de tenant inválido');

    expect(() =>
      buildUpdateQuery('stores', { name: 'Loja' }, 'id-1', { tenantId: '   ' })
    ).toThrow(BadRequestError);
    expect(() =>
      buildUpdateQuery('stores', { name: 'Loja' }, 'id-1', { tenantId: '   ' })
    ).toThrow('Identificador de tenant inválido');
  });

  it('deve permitir options.tenantId igual a undefined sem adicionar cláusula tenant_id', () => {
    const result = buildUpdateQuery('vehicles', { name: 'Gol' }, 'id-1', { tenantId: undefined });
    expect(result.query).toBe(
      'UPDATE vehicles SET name = $1 WHERE id = $2 AND deleted_at IS NULL RETURNING *;'
    );
    expect(result.values).toEqual(['Gol', 'id-1']);
  });
});

describe('query.util - buildFindQuery (segurança e filtros)', () => {
  it('deve montar SELECT com deleted_at IS NULL, ILIKE e = ANY para operador IN com array', () => {
    const result = buildFindQuery('vehicles', {
      filters: [
        { field: 'name', operator: 'ILIKE', value: 'Civic' },
        { field: 'status', operator: 'IN', value: ['ATIVO', 'RESERVADO'] },
      ],
      includeDeleted: false,
    });

    expect(result.query).toBe(
      'SELECT * FROM vehicles WHERE deleted_at IS NULL AND name ILIKE $1 AND status = ANY($2)'
    );
    expect(result.values).toEqual(['%Civic%', ['ATIVO', 'RESERVADO']]);
  });

  it('deve lançar BadRequestError quando operator for IN e value não for array', () => {
    expect(() =>
      buildFindQuery('vehicles', {
        filters: [{ field: 'status', operator: 'IN', value: 'ATIVO' as never }],
      })
    ).toThrow(BadRequestError);
    expect(() =>
      buildFindQuery('vehicles', {
        filters: [{ field: 'status', operator: 'IN', value: 'ATIVO' as never }],
      })
    ).toThrow('O operador IN exige um array de valores');
  });

  it('deve lançar BadRequestError quando filter.operator estiver fora da allowlist em runtime', () => {
    expect(() =>
      buildFindQuery('vehicles', {
        filters: [{ field: 'status', operator: '= 1 OR 1=1 --' as never, value: 'ATIVO' }],
      })
    ).toThrow(BadRequestError);
    expect(() =>
      buildFindQuery('vehicles', {
        filters: [{ field: 'status', operator: '= 1 OR 1=1 --' as never, value: 'ATIVO' }],
      })
    ).toThrow('Operador inválido: = 1 OR 1=1 --');
  });

  it('deve aplicar filtro tenant_id quando options.tenantId for informado e rejeitar tenantId vazio', () => {
    const result1 = buildFindQuery(
      'stores',
      { filters: [{ field: 'name', operator: '=', value: 'Matriz' }] },
      { tenantId: 'tenant-123' as never }
    );
    expect(result1.query).toBe(
      'SELECT * FROM stores WHERE deleted_at IS NULL AND tenant_id = $1 AND name = $2'
    );
    expect(result1.values).toEqual(['tenant-123', 'Matriz']);

    expect(() =>
      buildFindQuery('stores', { filters: [] }, { tenantId: '   ' as never })
    ).toThrow(BadRequestError);
    expect(() =>
      buildFindQuery('stores', { filters: [] }, { tenantId: '   ' as never })
    ).toThrow('Identificador de tenant inválido');
  });

  it('deve projetar colunas específicas, aplicar ORDER BY e parametrizar LIMIT quando informados em options', () => {
    const result = buildFindQuery(
      'users',
      { filters: [{ field: 'is_active', operator: '=', value: true }] },
      {
        columns: ['id', 'name', 'email'],
        orderBy: { field: 'created_at', direction: 'DESC' },
        limit: 25,
      }
    );

    expect(result.query).toBe(
      'SELECT id, name, email FROM users WHERE deleted_at IS NULL AND is_active = $1 ORDER BY created_at DESC LIMIT $2'
    );
    expect(result.values).toEqual([true, 25]);
  });

  it('deve lançar BadRequestError para columns vazio/inválido, orderBy inválido ou limit não-positivo', () => {
    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { columns: [] }
      )
    ).toThrow(BadRequestError);
    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { columns: [] }
      )
    ).toThrow('A lista de colunas para seleção não pode ser vazia');

    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { columns: ['id', 'password; --'] }
      )
    ).toThrow(BadRequestError);

    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { orderBy: { field: 'created_at', direction: 'RANDOM' as never } }
      )
    ).toThrow(BadRequestError);
    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { orderBy: { field: 'created_at', direction: 'RANDOM' as never } }
      )
    ).toThrow('Direção de ordenação inválida: RANDOM');

    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { limit: 0 }
      )
    ).toThrow(BadRequestError);
    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { limit: 0 }
      )
    ).toThrow('O limite deve ser um número inteiro positivo');

    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { limit: -5 }
      )
    ).toThrow('O limite deve ser um número inteiro positivo');

    expect(() =>
      buildFindQuery(
        'users',
        { filters: [] },
        { limit: 1.5 }
      )
    ).toThrow('O limite deve ser um número inteiro positivo');
  });
});

describe('query.util - buildFindQuery (paginação e offset)', () => {
  it('deve aplicar LIMIT e OFFSET a partir de filters.page e filters.limit', () => {
    const result = buildFindQuery(
      'users',
      { filters: [], page: 2, limit: 5 },
      { tenantId: 't-1' }
    );

    expect(result.query).toBe(
      'SELECT * FROM users WHERE deleted_at IS NULL AND tenant_id = $1 LIMIT $2 OFFSET $3'
    );
    expect(result.values).toEqual(['t-1', 5, 5]);
  });

  it('deve usar limit padrão 10 quando apenas filters.page for informado', () => {
    const result = buildFindQuery('users', { filters: [], page: 3 });

    expect(result.query).toBe(
      'SELECT * FROM users WHERE deleted_at IS NULL LIMIT $1 OFFSET $2'
    );
    expect(result.values).toEqual([10, 20]);
  });
});

describe('query.util - buildFindQuery (tenant do contexto prevalece)', () => {
  it('descarta filtro tenant_id do chamador e aplica options.tenantId', () => {
    const result = buildFindQuery(
      'stores',
      {
        filters: [
          { field: 'tenant_id', operator: '=', value: 'tenant-vitima' },
          { field: 'name', operator: '=', value: 'Matriz' },
        ],
      },
      { tenantId: 'tenant-meu' }
    );

    expect(result.query).toBe(
      'SELECT * FROM stores WHERE deleted_at IS NULL AND tenant_id = $1 AND name = $2'
    );
    expect(result.values).toEqual(['tenant-meu', 'Matriz']);
  });

  it('descarta filtro tenant_id com operador IN do chamador', () => {
    const result = buildFindQuery(
      'stores',
      {
        filters: [{ field: 'tenant_id', operator: 'IN', value: ['a', 'b'] }],
      },
      { tenantId: 'tenant-meu' }
    );

    expect(result.query).toBe(
      'SELECT * FROM stores WHERE deleted_at IS NULL AND tenant_id = $1'
    );
    expect(result.values).toEqual(['tenant-meu']);
    expect(result.query.match(/tenant_id = \$1/g)).toHaveLength(1);
  });

  it('mantém filtro tenant_id do chamador quando options.tenantId é undefined', () => {
    const result = buildFindQuery('stores', {
      filters: [{ field: 'tenant_id', operator: '=', value: 'tenant-x' }],
    });

    expect(result.query).toBe(
      'SELECT * FROM stores WHERE deleted_at IS NULL AND tenant_id = $1'
    );
    expect(result.values).toEqual(['tenant-x']);
  });
});
