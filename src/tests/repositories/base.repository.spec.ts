import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResultRow } from 'pg';

vi.mock('#src/config/database.js', () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

import BaseRepository from '#repositories/base.repository.js';
import { TenantRepository } from '#repositories/tenant.repository.js';
import { BadRequestError } from '#src/errors/app.error.js';
import pool from '#src/config/database.js';

interface Row extends QueryResultRow {
  id: string;
  name: string;
}

class Repo extends BaseRepository<Row> {}

describe('BaseRepository - construtor', () => {
  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
  });

  it('rejeita tableName com SQL injection', () => {
    expect(() => new Repo('widgets; DROP TABLE users; --')).toThrow(BadRequestError);
    expect(() => new Repo('widgets; DROP TABLE users; --')).toThrow(
      'Identificador inválido: widgets; DROP TABLE users; --'
    );
  });

  it('rejeita tableName vazio ou iniciado por dígito', () => {
    expect(() => new Repo('')).toThrow(BadRequestError);
    expect(() => new Repo('1abc')).toThrow(BadRequestError);
  });

  it('aceita tableName válido', () => {
    expect(() => new Repo('widgets')).not.toThrow();
  });
});

describe('BaseRepository - tenantScoped', () => {
  class ScopedRepo extends BaseRepository<Row> {}
  class RootRepo extends BaseRepository<Row> {}

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  let scopedRepo: ScopedRepo;
  let rootRepo: RootRepo;

  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    scopedRepo = new ScopedRepo('widgets');
    rootRepo = new RootRepo('roots', { tenantScoped: false });
  });

  it('TS-01: ScopedRepo.findById aplica AND tenant_id = $2 mesmo sem columns', async () => {
    await scopedRepo.findById('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toContain('AND tenant_id = $2');
    expect(values).toEqual(['id-1', 't-1']);
  });

  it('TS-02: ScopedRepo.find aplica tenant_id = $1 mesmo sem columns', async () => {
    await scopedRepo.find({ filters: [] }, 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toBe(
      'SELECT * FROM widgets WHERE deleted_at IS NULL AND tenant_id = $1'
    );
    expect(values).toEqual(['t-1']);
  });

  it('TS-03: ScopedRepo.update aplica AND tenant_id = $3 mesmo sem columns', async () => {
    await scopedRepo.update('id-1', { name: 'x' }, 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toBe(
      'UPDATE widgets SET name = $1 WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL RETURNING *;'
    );
    expect(values).toEqual(['x', 'id-1', 't-1']);
  });

  it('TS-04: ScopedRepo.delete aplica AND tenant_id = $2 mesmo sem columns', async () => {
    await scopedRepo.delete('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toContain('AND tenant_id = $2');
    expect(values).toEqual(['id-1', 't-1']);
  });

  it('TS-05: RootRepo.findById ignora tenantId quando tenantScoped é false', async () => {
    await rootRepo.findById('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).not.toContain('tenant_id');
    expect(values).toEqual(['id-1']);
  });

  it('TS-06: RootRepo.find, update e delete ignoram tenantId quando tenantScoped é false', async () => {
    await rootRepo.find({ filters: [] }, 't-1');
    await rootRepo.update('id-1', { name: 'x' }, 't-1');
    await rootRepo.delete('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(pool.query).mock.calls) {
      expect(normalize(call[0] as string)).not.toContain('tenant_id');
    }
  });

  it('TS-07: TenantRepository.findById não inclui tenant_id na query', async () => {
    await new TenantRepository().findById('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).not.toContain('tenant_id');
    expect(values).toEqual(['id-1']);
  });
});

describe('BaseRepository - tenantId inválido', () => {
  class ScopedRepo extends BaseRepository<Row> {}
  class RootRepo extends BaseRepository<Row> {}
  class HardRepo extends BaseRepository<Row> {}

  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  let scopedRepo: ScopedRepo;
  let rootRepo: RootRepo;
  let hardRepo: HardRepo;

  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    scopedRepo = new ScopedRepo('widgets');
    rootRepo = new RootRepo('roots', { tenantScoped: false });
    hardRepo = new HardRepo('widgets', { softDelete: false });
  });

  it('TI-01: findById com string vazia rejeita BadRequestError sem chamar pool.query', async () => {
    await expect(scopedRepo.findById('id-1', '')).rejects.toThrow(BadRequestError);
    await expect(scopedRepo.findById('id-1', '')).rejects.toThrow(
      'Identificador de tenant inválido'
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('TI-02: findById com espaços rejeita BadRequestError sem chamar pool.query', async () => {
    await expect(scopedRepo.findById('id-1', '   ')).rejects.toThrow(BadRequestError);
    await expect(scopedRepo.findById('id-1', '   ')).rejects.toThrow(
      'Identificador de tenant inválido'
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('TI-03: findById com tipo inválido rejeita BadRequestError sem chamar pool.query', async () => {
    await expect(scopedRepo.findById('id-1', 123 as unknown as string)).rejects.toThrow(
      BadRequestError
    );
    await expect(scopedRepo.findById('id-1', 123 as unknown as string)).rejects.toThrow(
      'Identificador de tenant inválido'
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('TI-04: delete (soft e hard) com string vazia rejeita BadRequestError sem chamar pool.query', async () => {
    await expect(scopedRepo.delete('id-1', '')).rejects.toThrow(BadRequestError);
    await expect(scopedRepo.delete('id-1', '')).rejects.toThrow(
      'Identificador de tenant inválido'
    );
    await expect(hardRepo.delete('id-1', '')).rejects.toThrow(BadRequestError);
    await expect(hardRepo.delete('id-1', '')).rejects.toThrow(
      'Identificador de tenant inválido'
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('TI-05: findById sem tenant (rota pública) executa sem cláusula tenant_id', async () => {
    await scopedRepo.findById('id-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toBe(
      'SELECT * FROM widgets WHERE id = $1 AND deleted_at IS NULL LIMIT 1;'
    );
    expect(values).toEqual(['id-1']);
  });

  it('TI-06: findById com tenantId válido gera cláusula AND tenant_id = $2', async () => {
    await scopedRepo.findById('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toBe(
      'SELECT * FROM widgets WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1;'
    );
    expect(values).toEqual(['id-1', 't-1']);
  });

  it('TI-07: delete (soft) com tenantId válido gera UPDATE com AND tenant_id = $2', async () => {
    await scopedRepo.delete('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toBe(
      'UPDATE widgets SET deleted_at = NOW(), is_active = false WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL RETURNING *;'
    );
    expect(values).toEqual(['id-1', 't-1']);
  });

  it('TI-08: delete (hard) com tenantId válido gera DELETE com AND tenant_id = $2', async () => {
    await hardRepo.delete('id-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).toBe(
      'DELETE FROM widgets WHERE id = $1 AND tenant_id = $2 RETURNING *;'
    );
    expect(values).toEqual(['id-1', 't-1']);
  });

  it('TI-09: RootRepo.findById com string vazia não rejeita e não inclui tenant_id', async () => {
    await expect(rootRepo.findById('id-1', '')).resolves.toBeNull();

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).not.toContain('tenant_id');
    expect(values).toEqual(['id-1']);
  });
});
