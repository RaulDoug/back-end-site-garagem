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
let sequence = 0;

const createRepositoryBrand = async (label: string) => {
  const brand = await brandRepository.create({
    name: `Marca_Para_Model_${RUN_ID}_${++sequence}_${label}`,
  });
  createdBrandIds.add(brand.id);
  return brand;
};

const createRepositoryModel = async (
  brandId: string,
  label: string,
  overrides: Partial<CreateModelData> = {}
) => {
  const model = await modelRepository.create({
    brand_id: brandId,
    name: `Modelo_${RUN_ID}_${++sequence}_${label}`,
    ...overrides,
  });

  createdModelIds.add(model.id);
  return model;
};

describe('ModelRepository - integração com PostgreSQL', () => {
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
  });

  it('deve criar um modelo vinculado a uma marca com sucesso', async () => {
    const brand = await createRepositoryBrand('marca_pai');
    const model = await createRepositoryModel(brand.id, 'sucesso');

    expect(model.id).toBeDefined();
    expect(model.brand_id).toBe(brand.id);
    expect(model.name).toContain('sucesso');
    expect(model.is_active).toBe(true);
    expect(model.deleted_at).toBeNull();
  });

  it('deve buscar modelo por ID (findById)', async () => {
    const brand = await createRepositoryBrand('busca');
    const model = await createRepositoryModel(brand.id, 'busca_id');

    const found = await modelRepository.findById(model.id);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(model.id);
    expect(found?.brand_id).toBe(brand.id);
  });

  it('deve atualizar o nome e a marca de um modelo (update)', async () => {
    const brand1 = await createRepositoryBrand('marca1');
    const brand2 = await createRepositoryBrand('marca2');
    const model = await createRepositoryModel(brand1.id, 'update');

    const updated = await modelRepository.update(model.id, {
      name: `Modelo_Alterado_${RUN_ID}`,
      brand_id: brand2.id,
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe(`Modelo_Alterado_${RUN_ID}`);
    expect(updated?.brand_id).toBe(brand2.id);
  });

  it('deve realizar soft delete do modelo (delete)', async () => {
    const brand = await createRepositoryBrand('marca_soft');
    const model = await createRepositoryModel(brand.id, 'soft_delete');

    const deleted = await modelRepository.delete(model.id);
    expect(deleted).not.toBeNull();
    expect(deleted?.deleted_at).not.toBeNull();
    expect(deleted?.is_active).toBe(false);

    // Consulta de repositório deve retornar null
    const found = await modelRepository.findById(model.id);
    expect(found).toBeNull();

    // Consulta direta no banco confirmando presença do registro
    const rawCheck = await pool.query('SELECT * FROM models WHERE id = $1', [model.id]);
    expect(rawCheck.rows.length).toBe(1);
    expect(rawCheck.rows[0].deleted_at).not.toBeNull();
  });

  it('deve lançar erro de foreign key (23503) ao cadastrar modelo com brand_id inexistente', async () => {
    const uuidInexistente = '00000000-0000-4000-8000-000000000000';

    await expect(
      modelRepository.create({
        brand_id: uuidInexistente,
        name: 'Modelo Fantasma',
      })
    ).rejects.toMatchObject({
      code: '23503',
    });
  });
});
