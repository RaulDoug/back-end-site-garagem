import 'dotenv/config';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import {
  StoreRepository,
  type CreateStoreData,
} from '#repositories/store.repository.js';
import pool from '#src/config/database.js';

const repository = new StoreRepository();
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const createdCnpjs = new Set<string>();
let sequence = 0;

// Gera CNPJ único de 14 dígitos para evitar colisões entre testes
const uniqueCnpj = () => {
  const seq = String(++sequence).padStart(4, '0');
  const base = `${RUN_ID.replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}${seq}`;
  return base.slice(0, 14);
};

const createRepositoryStore = async (
  label: string,
  overrides: Partial<CreateStoreData> = {}
) => {
  const cnpj = overrides.cnpj || uniqueCnpj();
  const store = await repository.create({
    name: `Loja ${label}`,
    phone: '(37) 98888-7777',
    cnpj,
    zip_code: '35500000',
    street: 'Av. Automotiva',
    number: '1000',
    neighborhood: 'Centro',
    city: 'Divinópolis',
    state: 'MG',
    complement: 'Sala 1',
    ...overrides,
  });

  createdCnpjs.add(store.cnpj);
  return store;
};

describe('StoreRepository - integração com PostgreSQL', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test. Execute com DB_PORT=5434 e DB_NAME=api_garage_test.'
      );
    }
  });

  afterEach(async () => {
    if (createdCnpjs.size === 0) return;

    await pool.query('DELETE FROM stores WHERE cnpj = ANY($1::text[])', [
      Array.from(createdCnpjs),
    ]);
    createdCnpjs.clear();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deve buscar loja ativa pelo CNPJ (findByCNPJ)', async () => {
    const store = await createRepositoryStore('busca_cnpj');

    const found = await repository.findByCNPJ(store.cnpj);

    expect(found).not.toBeNull();
    expect(found).toMatchObject({
      id: store.id,
      name: store.name,
      cnpj: store.cnpj,
      phone: store.phone,
      zip_code: store.zip_code,
      street: store.street,
      number: store.number,
      neighborhood: store.neighborhood,
      city: store.city,
      state: store.state,
      is_active: true,
      deleted_at: null,
    });
  });

  it('deve retornar null ao buscar CNPJ inexistente', async () => {
    const unexistentCnpj = '99999999000199';

    const found = await repository.findByCNPJ(unexistentCnpj);

    expect(found).toBeNull();
  });

  it('não deve retornar loja que foi soft-deleted ao buscar por CNPJ', async () => {
    const store = await createRepositoryStore('soft_deleted');
    await repository.delete(store.id);

    const found = await repository.findByCNPJ(store.cnpj);

    expect(found).toBeNull();
  });

  it('deve lançar erro de unicidade (23505) ao tentar cadastrar duas lojas ativas com o mesmo CNPJ', async () => {
    const store = await createRepositoryStore('unicidade_original');

    await expect(
      repository.create({
        name: 'Loja Duplicada',
        phone: '(37) 91111-2222',
        cnpj: store.cnpj,
        zip_code: '35500000',
        street: 'Rua das Flores',
        number: '50',
        neighborhood: 'Jardim',
        city: 'Divinópolis',
        state: 'MG',
      })
    ).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('deve permitir cadastrar loja com mesmo CNPJ caso o registro anterior tenha sido soft-deleted', async () => {
    const firstStore = await createRepositoryStore('primeira_loja');
    await repository.delete(firstStore.id);

    // Como firstStore está com deleted_at preenchido, o índice parcial permite reutilizar o CNPJ
    const secondStore = await repository.create({
      name: 'Segunda Loja Reutilizando CNPJ',
      phone: '(37) 93333-4444',
      cnpj: firstStore.cnpj,
      zip_code: '35500000',
      street: 'Outro Endereço',
      number: '200',
      neighborhood: 'Industrial',
      city: 'Divinópolis',
      state: 'MG',
    });

    createdCnpjs.add(secondStore.cnpj);

    expect(secondStore.id).not.toBe(firstStore.id);
    expect(secondStore.cnpj).toBe(firstStore.cnpj);
    expect(secondStore.deleted_at).toBeNull();
  });
});
