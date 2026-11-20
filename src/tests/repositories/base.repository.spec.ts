import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResultRow } from 'pg';

vi.mock('#src/config/database.js', () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

import BaseRepository from '#repositories/base.repository.js';
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
