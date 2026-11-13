import { describe, it, expect } from 'vitest';
import { buildUpdateQuery } from '#src/utils/query.util.js';
import { BadRequestError } from '#src/errors/app.error.js';

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
});
