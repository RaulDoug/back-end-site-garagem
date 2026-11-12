import 'dotenv/config';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import {
  ModelRepository,
  type CreateModelData,
} from '#repositories/model.repository.js';
import { BrandRepository } from '#repositories/brand.repository.js';
import pool from '#src/config/database.js';

const modelRepository = new ModelRepository();
const brandRepository = new BrandRepository();

const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const createdModelIds = new Set<string>();
const createdBrandIds = new Set<string>();
const createdTenantIds = new Set<string>();
let sequence = 0;

const createRepositoryTenant = async (name: string) => {
  const cnpj = `${String(Math.floor(1000000000 + Math.random() * 9000000000)).slice(0, 10)}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 14);
  const res = await pool.query(
    `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
     VALUES ($1, $2, $3, true) RETURNING id`,
    [`${name} Corp`, name, cnpj]
  );
  const id = res.rows[0].id;
  createdTenantIds.add(id);
  return id;
};

const createRepositoryBrand = async (label: string, tenantId?: string | null) => {
  const brand = await brandRepository.create({
    name: `Marca_Para_Model_${RUN_ID}_${++sequence}_${label}`,
    tenant_id: tenantId ?? null,
  });
  createdBrandIds.add(brand.id);
  return brand;
};

const createRepositoryModel = async (
  tenantId: string,
  brandId: string,
  label: string,
  overrides: Partial<CreateModelData> = {}
) => {
  const model = await modelRepository.create({
    tenant_id: tenantId,
    brand_id: brandId,
    name: `Modelo_${RUN_ID}_${++sequence}_${label}`,
    ...overrides,
  });

  createdModelIds.add(model.id);
  return model;
};

describe('ModelRepository - integração com PostgreSQL (Multi-tenant)', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test. Execute com DB_PORT=5434 e DB_NAME=api_garage_test.'
      );
    }
  });

  afterEach(async () => {
    if (createdModelIds.size > 0) {
      await pool.query('DELETE FROM models WHERE id = ANY($1::uuid[])', [
        Array.from(createdModelIds),
      ]);
      createdModelIds.clear();
    }

    if (createdBrandIds.size > 0) {
      await pool.query('DELETE FROM brands WHERE id = ANY($1::uuid[])', [
        Array.from(createdBrandIds),
      ]);
      createdBrandIds.clear();
    }

    if (createdTenantIds.size > 0) {
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [
        Array.from(createdTenantIds),
      ]);
      createdTenantIds.clear();
    }
  });

  it('deve criar um modelo vinculado a um tenant e marca com sucesso', async () => {
    const tenantId = await createRepositoryTenant('Tenant Model 1');
    const brand = await createRepositoryBrand('marca_pai');
    const model = await createRepositoryModel(tenantId, brand.id, 'sucesso');

    expect(model.id).toBeDefined();
    expect(model.tenant_id).toBe(tenantId);
    expect(model.brand_id).toBe(brand.id);
    expect(model.name).toContain('sucesso');
    expect(model.is_active).toBe(true);
    expect(model.deleted_at).toBeNull();
  });

  it('deve buscar modelo por ID respeitando tenant_id (findById)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Model A');
    const tenantB = await createRepositoryTenant('Tenant Model B');
    const brand = await createRepositoryBrand('busca');
    const model = await createRepositoryModel(tenantA, brand.id, 'busca_id');

    // Tenant A encontra
    const foundA = await modelRepository.findById(model.id, tenantA);
    expect(foundA).not.toBeNull();
    expect(foundA?.id).toBe(model.id);

    // Tenant B não encontra (isolamento)
    const foundB = await modelRepository.findById(model.id, tenantB);
    expect(foundB).toBeNull();
  });

  it('deve buscar modelo por nome, marca e tenant (findByNameAndBrand)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Model Name A');
    const tenantB = await createRepositoryTenant('Tenant Model Name B');
    const brand = await createRepositoryBrand('brand_name');
    const model = await createRepositoryModel(tenantA, brand.id, 'exact_name');

    // Tenant A encontra case-insensitive
    const found = await modelRepository.findByNameAndBrand(model.name.toUpperCase(), brand.id, tenantA);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(model.id);

    // Tenant B não encontra
    const notFound = await modelRepository.findByNameAndBrand(model.name, brand.id, tenantB);
    expect(notFound).toBeNull();
  });

  it('deve buscar modelos por marca filtrando por tenant (findByBrandId)', async () => {
    const tenantA = await createRepositoryTenant('Tenant Model Brand A');
    const tenantB = await createRepositoryTenant('Tenant Model Brand B');
    const brand = await createRepositoryBrand('brand_list');

    const modelA = await createRepositoryModel(tenantA, brand.id, 'model_a');
    await createRepositoryModel(tenantB, brand.id, 'model_b');

    const listA = await modelRepository.findByBrandId(brand.id, tenantA);
    expect(listA.length).toBe(1);
    expect(listA[0].id).toBe(modelA.id);
  });

  it('deve atualizar o nome e a marca de um modelo respeitando tenant_id (update)', async () => {
    const tenantId = await createRepositoryTenant('Tenant Model Update');
    const brand1 = await createRepositoryBrand('marca1');
    const brand2 = await createRepositoryBrand('marca2');
    const model = await createRepositoryModel(tenantId, brand1.id, 'update');

    const updated = await modelRepository.update(model.id, {
      name: `Modelo_Alterado_${RUN_ID}`,
      brand_id: brand2.id,
    }, tenantId);

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe(`Modelo_Alterado_${RUN_ID}`);
    expect(updated?.brand_id).toBe(brand2.id);
  });

  it('deve realizar soft delete do modelo respeitando tenant_id (delete)', async () => {
    const tenantId = await createRepositoryTenant('Tenant Model Delete');
    const brand = await createRepositoryBrand('marca_soft');
    const model = await createRepositoryModel(tenantId, brand.id, 'soft_delete');

    const deleted = await modelRepository.delete(model.id, tenantId);
    expect(deleted).not.toBeNull();
    expect(deleted?.deleted_at).not.toBeNull();
    expect(deleted?.is_active).toBe(false);

    // Consulta de repositório deve retornar null
    const found = await modelRepository.findById(model.id, tenantId);
    expect(found).toBeNull();

    // Consulta direta no banco confirmando presença do registro
    const rawCheck = await pool.query('SELECT * FROM models WHERE id = $1', [model.id]);
    expect(rawCheck.rows.length).toBe(1);
    expect(rawCheck.rows[0].deleted_at).not.toBeNull();
  });

  it('deve permitir mesmo nome de modelo na mesma marca em tenants distintos, mas bloquear no mesmo tenant', async () => {
    const tenantA = await createRepositoryTenant('Tenant Model Unique A');
    const tenantB = await createRepositoryTenant('Tenant Model Unique B');
    const brand = await createRepositoryBrand('brand_unique');
    const modelName = `Civic_${RUN_ID}`;

    const modelA = await createRepositoryModel(tenantA, brand.id, 'unique', { name: modelName });
    const modelB = await createRepositoryModel(tenantB, brand.id, 'unique', { name: modelName });

    expect(modelA.id).toBeDefined();
    expect(modelB.id).toBeDefined();

    // Tentar criar mesmo nome para mesma marca no Tenant A -> erro 23505
    await expect(
      modelRepository.create({
        tenant_id: tenantA,
        brand_id: brand.id,
        name: modelName,
      })
    ).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('deve lançar erro de foreign key (23503) ao cadastrar modelo com brand_id inexistente', async () => {
    const tenantId = await createRepositoryTenant('Tenant Model FK');
    const uuidInexistente = '00000000-0000-4000-8000-000000000000';

    await expect(
      modelRepository.create({
        tenant_id: tenantId,
        brand_id: uuidInexistente,
        name: 'Modelo Fantasma',
      })
    ).rejects.toMatchObject({
      code: '23503',
    });
  });
});
