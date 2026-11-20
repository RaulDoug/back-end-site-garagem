import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('#src/config/database.js', () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

import { VehicleRepository } from '#repositories/vehicle.repository.js';
import { BadRequestError } from '#src/errors/app.error.js';
import pool from '#src/config/database.js';

describe('VehicleRepository - delete', () => {
  const normalize = (s: string) => s.replace(/\s+/g, ' ').trim();
  let vehicleRepository: VehicleRepository;

  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    vehicleRepository = new VehicleRepository();
  });

  it('VD-01: rejeita tenantId vazio com BadRequestError sem chamar pool.query', async () => {
    await expect(vehicleRepository.delete('v-1', '')).rejects.toThrow(BadRequestError);
    await expect(vehicleRepository.delete('v-1', '')).rejects.toThrow(
      'Identificador de tenant inválido'
    );
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('VD-02: inclui AND tenant_id = $2 quando tenantId válido é informado', async () => {
    await vehicleRepository.delete('v-1', 't-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    const normalizedSql = normalize(sql as string);
    expect(normalizedSql).toContain('AND tenant_id = $2');
    expect(normalizedSql).toContain('RETURNING *;');
    expect(values).toEqual(['v-1', 't-1']);
  });

  it('VD-03: executa sem cláusula tenant_id quando tenantId é omitido', async () => {
    await vehicleRepository.delete('v-1');

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(normalize(sql as string)).not.toContain('tenant_id');
    expect(values).toEqual(['v-1']);
  });
});
