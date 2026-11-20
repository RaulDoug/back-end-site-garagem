import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { QueryResultRow } from 'pg';

vi.mock('#src/config/database.js', () => ({
  default: { query: vi.fn(), connect: vi.fn() },
}));

import BaseService from '#services/base.service.js';
import BaseRepository from '#repositories/base.repository.js';
import type { FindData } from '#repositories/base.repository.js';
import pool from '#src/config/database.js';

interface WidgetRow extends QueryResultRow {
  id: string;
  name: string;
  tenant_id: string;
}

class WidgetRepository extends BaseRepository<WidgetRow> {}

describe('BaseService - find', () => {
  let mockRepository: BaseRepository<WidgetRow>;
  let service: BaseService<WidgetRow>;

  beforeEach(() => {
    vi.mocked(pool.query).mockReset();
    mockRepository = {
      find: vi.fn().mockResolvedValue([]),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } as unknown as BaseRepository<WidgetRow>;
    service = new BaseService(mockRepository);
  });

  it('BS-01: delega filters e tenantId diretamente para repository.find', async () => {
    const filters: FindData = {
      filters: [{ field: 'name', operator: '=', value: 'Matriz' }],
    };

    await service.find(filters, 't-A');

    expect(mockRepository.find).toHaveBeenCalledTimes(1);
    expect(mockRepository.find).toHaveBeenCalledWith(filters, 't-A');
  });

  it('BS-02: não altera filters.filters do chamador nem injeta tenant_id', async () => {
    const filters: FindData = {
      filters: [{ field: 'name', operator: '=', value: 'Matriz' }],
    };

    await service.find(filters, 't-A');

    expect(filters.filters).toEqual([{ field: 'name', operator: '=', value: 'Matriz' }]);
    expect(mockRepository.find).toHaveBeenCalledWith(
      { filters: [{ field: 'name', operator: '=', value: 'Matriz' }] },
      't-A'
    );
  });

  it('BS-03: find sem argumentos chama repository.find com ({ filters: [] }, undefined)', async () => {
    await service.find();

    expect(mockRepository.find).toHaveBeenCalledWith({ filters: [] }, undefined);
  });

  it('BS-04: find sem tenantId chama repository.find com (filters, undefined)', async () => {
    const filters: FindData = { filters: [{ field: 'is_active', operator: '=', value: true }] };

    await service.find(filters);

    expect(mockRepository.find).toHaveBeenCalledWith(filters, undefined);
  });

  it('BS-05: composição real descarta tenant_id do chamador e aplica apenas tenant-meu no SQL', async () => {
    vi.mocked(pool.query).mockResolvedValue({ rows: [] } as never);
    const realRepo = new WidgetRepository('widgets');
    const realService = new BaseService(realRepo);

    await realService.find(
      {
        filters: [{ field: 'tenant_id', operator: '=', value: 'tenant-vitima' }],
      },
      'tenant-meu'
    );

    expect(pool.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(pool.query).mock.calls[0];
    expect(values).toEqual(['tenant-meu']);
    expect((sql as string).match(/tenant_id/g)).toHaveLength(1);
  });
});
