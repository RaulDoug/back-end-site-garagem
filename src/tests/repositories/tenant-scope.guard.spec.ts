import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { brandRepository } from '#repositories/brand.repository.js';
import { featureRepository } from '#repositories/feature.repository.js';
import { modelRepository } from '#repositories/model.repository.js';
import { storeRepository } from '#repositories/store.repository.js';
import { tenantRepository } from '#repositories/tenant.repository.js';
import { userRepository } from '#repositories/user.repository.js';
import { VehicleRepository } from '#repositories/vehicle.repository.js';

interface InspectableRepository {
  options: { tenantScoped?: boolean };
  columns: string[];
}

const asInspectable = (repo: unknown): InspectableRepository =>
  repo as unknown as InspectableRepository;

const vehicleRepository = new VehicleRepository();

describe('Arquitetura - Escopo de tenant dos repositórios', () => {
  it('toda subclasse de BaseRepository está registrada', () => {
    const repositoriesDir = path.resolve(process.cwd(), 'src/repositories');
    const files = fs.readdirSync(repositoriesDir).filter((file) => file.endsWith('.repository.ts'));

    const subclasses = files
      .filter((file) =>
        fs.readFileSync(path.join(repositoriesDir, file), 'utf-8').includes('extends BaseRepository')
      )
      .map((file) => file.replace(/\.repository\.ts$/, ''))
      .sort();

    expect(subclasses).toEqual([
      'brand',
      'feature',
      'model',
      'store',
      'tenant',
      'user',
      'vehicle',
    ]);
  });

  it.each([
    ['brandRepository', brandRepository],
    ['featureRepository', featureRepository],
    ['modelRepository', modelRepository],
    ['storeRepository', storeRepository],
    ['userRepository', userRepository],
    ['vehicleRepository', vehicleRepository],
  ])('%s declara tenantScoped: true e inclui tenant_id em columns', (_name, repo) => {
    const inspectable = asInspectable(repo);
    expect(inspectable.options.tenantScoped).toBe(true);
    expect(inspectable.columns).toContain('tenant_id');
  });

  it('tenants é tabela raiz', () => {
    const inspectable = asInspectable(tenantRepository);
    expect(inspectable.options.tenantScoped).toBe(false);
  });
});
