import 'dotenv/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  BrandRepository,
  type CreateBrandData,
} from '#repositories/brand.repository.js';
import pool from '#src/config/database.js';

const repository = new BrandRepository();
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const createdIds = new Set<string>();
const createdTenantIds = new Set<string>();
let sequence = 0;

let tenantA: { id: string };
let tenantB: { id: string };

const createRepositoryBrand = async (
  label: string,
  overrides: Partial<CreateBrandData> = {}
) => {
  const brand = await repository.create({
    name: `Marca_${RUN_ID}_${++sequence}_${label}`,
    ...overrides,
  });

  createdIds.add(brand.id);
  return brand;
};

describe('BrandRepository - integração com PostgreSQL (Catálogo Híbrido)', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test.'
      );
    }
  });

  beforeEach(async () => {
    const resA = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id;`,
      [`Tenant Brand A ${++sequence}`, 'Trade Brand A', `${Date.now()}`.slice(0, 14)]
    );
    tenantA = resA.rows[0];
    createdTenantIds.add(tenantA.id);

    const resB = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id;`,
      [`Tenant Brand B ${++sequence}`, 'Trade Brand B', `${Date.now() + 1}`.slice(0, 14)]
    );
    tenantB = resB.rows[0];
    createdTenantIds.add(tenantB.id);
  });

  afterEach(async () => {
    if (createdIds.size > 0) {
      await pool.query('DELETE FROM brands WHERE id = ANY($1::uuid[])', [
        Array.from(createdIds),
      ]);
      createdIds.clear();
    }
    if (createdTenantIds.size > 0) {
      await pool.query('DELETE FROM brands WHERE tenant_id = ANY($1::uuid[])', [
        Array.from(createdTenantIds),
      ]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [
        Array.from(createdTenantIds),
      ]);
      createdTenantIds.clear();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deve criar uma nova marca com sucesso', async () => {
    const brand = await createRepositoryBrand('criacao');

    expect(brand.id).toBeDefined();
    expect(brand.name).toContain('criacao');
    expect(brand.is_active).toBe(true);
    expect(brand.deleted_at).toBeNull();
  });

  it('deve encontrar uma marca ativa por ID (findById)', async () => {
    const brand = await createRepositoryBrand('busca_id');

    const found = await repository.findById(brand.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(brand.id);
    expect(found?.name).toBe(brand.name);
  });

  it('deve atualizar o nome da marca (update)', async () => {
    const brand = await createRepositoryBrand('update_nome');
    const novoNome = `Atualizada_${RUN_ID}_${++sequence}`;

    const updated = await repository.update(brand.id, { name: novoNome });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe(novoNome);
  });

  it('deve realizar soft delete da marca (delete)', async () => {
    const brand = await createRepositoryBrand('soft_delete');

    const deleted = await repository.delete(brand.id);
    expect(deleted).not.toBeNull();
    expect(deleted?.deleted_at).not.toBeNull();
    expect(deleted?.is_active).toBe(false);

    const foundAfterDelete = await repository.findById(brand.id);
    expect(foundAfterDelete).toBeNull();
  });

  it('deve listar marcas híbridas (globais e do tenant) em findForTenant', async () => {
    const globalBrand = await createRepositoryBrand('global', { tenant_id: null });
    const brandA = await createRepositoryBrand('tenant_a', { tenant_id: tenantA.id });
    const brandB = await createRepositoryBrand('tenant_b', { tenant_id: tenantB.id });

    const brandsForA = await repository.findForTenant(tenantA.id);

    const idsForA = brandsForA.map((b) => b.id);
    expect(idsForA).toContain(globalBrand.id);
    expect(idsForA).toContain(brandA.id);
    expect(idsForA).not.toContain(brandB.id);
  });

  it('deve encontrar marcas globais e do tenant em findByIdForTenant e findByNameForTenant', async () => {
    const globalBrand = await createRepositoryBrand('global_busca', { tenant_id: null });
    const brandA = await createRepositoryBrand('tenant_a_busca', { tenant_id: tenantA.id });
    const brandB = await createRepositoryBrand('tenant_b_busca', { tenant_id: tenantB.id });

    // Busca por ID
    expect(await repository.findByIdForTenant(globalBrand.id, tenantA.id)).not.toBeNull();
    expect(await repository.findByIdForTenant(brandA.id, tenantA.id)).not.toBeNull();
    expect(await repository.findByIdForTenant(brandB.id, tenantA.id)).toBeNull();

    // Busca por Nome
    expect(await repository.findByNameForTenant(globalBrand.name, tenantA.id)).not.toBeNull();
    expect(await repository.findByNameForTenant(brandA.name, tenantA.id)).not.toBeNull();
    expect(await repository.findByNameForTenant(brandB.name, tenantA.id)).toBeNull();
  });
});
