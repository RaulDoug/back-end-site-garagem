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
  StoreRepository,
  type CreateStoreData,
} from '#repositories/store.repository.js';
import pool from '#src/config/database.js';

const repository = new StoreRepository();
const createdTenantIds = new Set<string>();
let sequence = 0;

// Gera CNPJ único de 14 dígitos para evitar colisões entre testes
const uniqueCnpj = () =>
  `${Math.floor(1000000000 + Math.random() * 9000000000)}${String(++sequence).padStart(4, '0')}`;

let tenantA: { id: string; cnpj: string };
let tenantB: { id: string; cnpj: string };

const createRepositoryStore = async (
  label: string,
  overrides: Partial<CreateStoreData> = {}
) => {
  const cnpj = overrides.cnpj || uniqueCnpj();
  const store = await repository.create({
    tenant_id: tenantA.id,
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

  beforeEach(async () => {
    const resA = await pool.query(
      'INSERT INTO tenants (corporate_name, trade_name, cnpj) VALUES ($1, $2, $3) RETURNING id, cnpj',
      ['Tenant A Corp', 'Tenant A Trade', uniqueCnpj()]
    );
    tenantA = resA.rows[0];
    createdTenantIds.add(tenantA.id);

    const resB = await pool.query(
      'INSERT INTO tenants (corporate_name, trade_name, cnpj) VALUES ($1, $2, $3) RETURNING id, cnpj',
      ['Tenant B Corp', 'Tenant B Trade', uniqueCnpj()]
    );
    tenantB = resB.rows[0];
    createdTenantIds.add(tenantB.id);
  });

  afterEach(async () => {
    if (createdTenantIds.size === 0) return;

    const ids = Array.from(createdTenantIds);
    await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
    createdTenantIds.clear();
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
      tenant_id: tenantA.id,
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
        tenant_id: tenantA.id,
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
      tenant_id: tenantA.id,
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

    expect(secondStore.id).not.toBe(firstStore.id);
    expect(secondStore.cnpj).toBe(firstStore.cnpj);
    expect(secondStore.deleted_at).toBeNull();
  });

  it('deve filtrar lojas por tenant_id no find e findById', async () => {
    const storeA = await createRepositoryStore('tenant_A');
    const storeB = await createRepositoryStore('tenant_B', {
      tenant_id: tenantB.id,
    });

    const foundA = await repository.findById(storeA.id, tenantA.id);
    expect(foundA).not.toBeNull();
    expect(foundA?.id).toBe(storeA.id);

    const crossFound = await repository.findById(storeA.id, tenantB.id);
    expect(crossFound).toBeNull();

    const storesForTenantA = await repository.find({
      filters: [{ field: 'tenant_id', operator: '=', value: tenantA.id }],
    });
    expect(storesForTenantA.some((s) => s.id === storeA.id)).toBe(true);
    expect(storesForTenantA.some((s) => s.id === storeB.id)).toBe(false);
  });

  it('não deve permitir que tenantB atualize ou delete uma loja pertencente ao tenantA', async () => {
    const storeA = await createRepositoryStore('alvo_isolamento');

    const updateAttempt = await repository.update(
      storeA.id,
      { name: 'Nome Hackeado' },
      tenantB.id
    );
    expect(updateAttempt).toBeNull();

    const checkStore = await repository.findById(storeA.id, tenantA.id);
    expect(checkStore?.name).toBe(storeA.name);

    const deleteAttempt = await repository.delete(storeA.id, tenantB.id);
    expect(deleteAttempt).toBeNull();

    const afterDeleteCheck = await repository.findById(storeA.id, tenantA.id);
    expect(afterDeleteCheck).not.toBeNull();
    expect(afterDeleteCheck?.deleted_at).toBeNull();
  });

  it('findByIdAndTenant(id, tenantId) deve retornar a loja apenas se pertencer ao tenantId informado', async () => {
    const storeA = await createRepositoryStore('busca_tenant');

    const match = await repository.findByIdAndTenant(storeA.id, tenantA.id);
    expect(match).not.toBeNull();
    expect(match?.id).toBe(storeA.id);
    expect(match?.tenant_id).toBe(tenantA.id);

    const mismatch = await repository.findByIdAndTenant(storeA.id, tenantB.id);
    expect(mismatch).toBeNull();
  });
});
