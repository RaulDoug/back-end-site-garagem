import 'dotenv/config';
import {
  afterEach,
  beforeAll,
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
let sequence = 0;

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

describe('BrandRepository - integração com PostgreSQL', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test. Execute com DB_PORT=5434 e DB_NAME=api_garage_test.'
      );
    }
  });

  afterEach(async () => {
    if (createdIds.size === 0) return;

    await pool.query('DELETE FROM brands WHERE id = ANY($1::uuid[])', [
      Array.from(createdIds),
    ]);
    createdIds.clear();
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
    const novoNome = `Atualizada_${RUN_ID}`;

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

    // findById padrão da base repository deve retornar null
    const foundAfterDelete = await repository.findById(brand.id);
    expect(foundAfterDelete).toBeNull();

    // Verificação física no banco de dados
    const rawCheck = await pool.query('SELECT * FROM brands WHERE id = $1', [brand.id]);
    expect(rawCheck.rows.length).toBe(1);
    expect(rawCheck.rows[0].deleted_at).not.toBeNull();
  });
});
