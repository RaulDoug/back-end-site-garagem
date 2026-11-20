import 'dotenv/config';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  TenantRepository,
  type CreateTenantData,
} from '#repositories/tenant.repository.js';
import pool from '#src/config/database.js';

const repository = new TenantRepository();
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
const createdTenantIds = new Set<string>();
let sequence = 0;

const uniqueCnpj = () => {
  const seq = String(++sequence).padStart(4, '0');
  const base = `${RUN_ID.replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}${seq}`;
  return base.slice(0, 14);
};

const createTestTenant = async (
  label: string,
  overrides: Partial<CreateTenantData> = {}
) => {
  const cnpj = overrides.cnpj || uniqueCnpj();
  const tenant = await repository.create({
    corporate_name: `Empresa ${label} Razão`,
    trade_name: `Empresa ${label} Fantasia`,
    cnpj,
    ...overrides,
  });

  createdTenantIds.add(tenant.id);
  return tenant;
};

describe('TenantRepository - integração com PostgreSQL', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test.'
      );
    }
  });

  afterEach(async () => {
    if (createdTenantIds.size === 0) return;

    const ids = Array.from(createdTenantIds);
    await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
    await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
    createdTenantIds.clear();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deve criar um tenant com sucesso', async () => {
    const tenant = await createTestTenant('create');
    expect(tenant.id).toBeDefined();
    expect(tenant.corporate_name).toBe('Empresa create Razão');
    expect(tenant.is_active).toBe(true);
  });

  it('deve buscar tenant ativo pelo CNPJ', async () => {
    const tenant = await createTestTenant('busca_cnpj');
    const found = await repository.findByCNPJ(tenant.cnpj);

    expect(found).not.toBeNull();
    expect(found?.id).toBe(tenant.id);
  });

  it('não deve retornar tenant excluído por soft delete ao buscar por CNPJ', async () => {
    const tenant = await createTestTenant('soft_delete_cnpj');
    await repository.delete(tenant.id);

    const found = await repository.findByCNPJ(tenant.cnpj);
    expect(found).toBeNull();
  });

  it('deve atualizar dados do tenant', async () => {
    const tenant = await createTestTenant('update');
    const updated = await repository.update(tenant.id, {
      trade_name: 'Novo Nome Fantasia Atualizado',
    });

    expect(updated).not.toBeNull();
    expect(updated?.trade_name).toBe('Novo Nome Fantasia Atualizado');
  });

  it('deve realizar soft delete do tenant', async () => {
    const tenant = await createTestTenant('delete');
    const deleted = await repository.delete(tenant.id);

    expect(deleted).not.toBeNull();
    expect(deleted?.deleted_at).not.toBeNull();
    expect(deleted?.is_active).toBe(false);

    const found = await repository.findById(tenant.id);
    expect(found).toBeNull();
  });

  it('deve executar onboardTenant em transação atômica criando tenant, store e admin', async () => {
    const tenantCnpj = uniqueCnpj();
    const storeCnpj = uniqueCnpj();
    const adminEmail = `admin_${Date.now()}@test.com`;

    const result = await repository.onboardTenant({
      tenant: {
        corporate_name: 'Empresa Onboard Matriz Ltda',
        trade_name: 'Onboard Matriz',
        cnpj: tenantCnpj,
      },
      store: {
        name: 'Loja Matriz',
        phone: '(37) 98888-7777',
        cnpj: storeCnpj,
        zip_code: '35500000',
        street: 'Rua Principal',
        number: '500',
        neighborhood: 'Centro',
        city: 'Divinópolis',
        state: 'MG',
      },
      admin: {
        name: 'Admin Onboard',
        email: adminEmail,
        password_hash: 'hash_senha_teste_123',
        phone: '(37) 99999-8888',
      },
    });

    createdTenantIds.add(result.tenant.id);

    expect(result.tenant.id).toBeDefined();
    expect(result.tenant.cnpj).toBe(tenantCnpj);

    expect(result.store.id).toBeDefined();
    expect(result.store.tenant_id).toBe(result.tenant.id);
    expect(result.store.cnpj).toBe(storeCnpj);

    expect(result.admin.id).toBeDefined();
    expect(result.admin.tenant_id).toBe(result.tenant.id);
    expect(result.admin.store_id).toBe(result.store.id);
    expect(result.admin.role).toBe('ADMIN');
    expect((result.admin as Record<string, unknown>).password_hash).toBeUndefined();
  });

  it('deve vincular admin.store_id como null quando is_multi_store for true', async () => {
    const tenantCnpj = uniqueCnpj();
    const storeCnpj = uniqueCnpj();
    const adminEmail = `admin_multi_${Date.now()}@test.com`;

    const result = await repository.onboardTenant({
      is_multi_store: true,
      tenant: {
        corporate_name: 'Empresa Multi Store Ltda',
        trade_name: 'Multi Store Matriz',
        cnpj: tenantCnpj,
      },
      store: {
        name: 'Loja Matriz Multi',
        phone: '(37) 98888-7777',
        cnpj: storeCnpj,
        zip_code: '35500000',
        street: 'Rua Principal',
        number: '500',
        neighborhood: 'Centro',
        city: 'Divinópolis',
        state: 'MG',
      },
      admin: {
        name: 'Admin Multi Store',
        email: adminEmail,
        password_hash: 'hash_senha_teste_123',
        phone: '(37) 99999-8888',
      },
    });

    createdTenantIds.add(result.tenant.id);

    expect(result.tenant.id).toBeDefined();
    expect(result.store.id).toBeDefined();
    expect(result.admin.id).toBeDefined();
    expect(result.admin.store_id).toBeNull();
  });

  it('deve usar o mockPool fornecido via construtor para métodos herdados como findById e update', async () => {
    const mockPool = {
      query: (queryText: string, params: unknown[]) => {
        if (queryText.includes('SELECT * FROM tenants') && queryText.includes('WHERE id = $1')) {
          return Promise.resolve({
            rows: [
              {
                id: params[0],
                corporate_name: 'Mock Corp',
                trade_name: 'Mock Trade',
                cnpj: '11222333000199',
                is_active: true,
                created_at: new Date(),
              },
            ],
          });
        }
        if (queryText.includes('UPDATE tenants')) {
          return Promise.resolve({
            rows: [
              {
                id: params[params.length - 1],
                trade_name: 'Updated via Mock',
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      },
      connect: () => Promise.reject(new Error('not implemented')),
    };

    const repoWithMock = new TenantRepository(mockPool as unknown as Pool);
    const tenant = await repoWithMock.findById('11111111-1111-1111-1111-111111111111');
    expect(tenant).not.toBeNull();
    expect(tenant?.corporate_name).toBe('Mock Corp');

    const updated = await repoWithMock.update('11111111-1111-1111-1111-111111111111', {
      trade_name: 'Updated via Mock',
    });
    expect(updated).not.toBeNull();
    expect(updated?.trade_name).toBe('Updated via Mock');
  });

  it('deve preservar o erro original da query e chamar client.release() mesmo se client.query("ROLLBACK") falhar', async () => {
    let rollbackCalled = false;
    let releaseCalled = false;
    const queryOriginalError = new Error('Database query failed catastrophically');

    const mockClient = {
      query: (sql: string) => {
        if (sql === 'BEGIN') return Promise.resolve();
        if (sql === 'ROLLBACK') {
          rollbackCalled = true;
          return Promise.reject(new Error('Connection broken during rollback'));
        }
        return Promise.reject(queryOriginalError);
      },
      release: () => {
        releaseCalled = true;
      },
    };

    const mockPool = {
      query: () => Promise.resolve({ rows: [] }),
      connect: () => Promise.resolve(mockClient),
    };

    const repoWithMock = new TenantRepository(mockPool as unknown as Pool);

    await expect(
      repoWithMock.onboardTenant({
        tenant: {
          corporate_name: 'Empresa Teste',
          trade_name: 'Empresa',
          cnpj: '12345678000195',
        },
        store: {
          name: 'Loja',
          phone: '(37) 98888-7777',
          cnpj: '12345678000195',
          zip_code: '35500000',
          street: 'Rua',
          number: '1',
          neighborhood: 'Bairro',
          city: 'Cidade',
          state: 'MG',
        },
        admin: {
          name: 'Admin',
          email: 'admin@test.com',
          password_hash: 'hash',
          phone: '(37) 99999-8888',
        },
      })
    ).rejects.toThrow('Database query failed catastrophically');

    expect(rollbackCalled).toBe(true);
    expect(releaseCalled).toBe(true);
  });

  it('deve realizar rollback completo no onboardTenant quando a inserção da loja ou admin falhar', async () => {
    const tenantCnpj = uniqueCnpj();
    // Loja pré-existente com CNPJ duplicado para forçar erro 23505 dentro da transação
    const existingStoreTenant = await createTestTenant('pre_existing');
    const duplicatedStoreCnpj = uniqueCnpj();

    await pool.query(
      `INSERT INTO stores (tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        existingStoreTenant.id,
        'Loja Existente',
        '11999998888',
        duplicatedStoreCnpj,
        '01001000',
        'Rua A',
        '1',
        'Centro',
        'São Paulo',
        'SP',
      ]
    );

    await expect(
      repository.onboardTenant({
        tenant: {
          corporate_name: 'Empresa Falha Onboard',
          trade_name: 'Falha Onboard',
          cnpj: tenantCnpj,
        },
        store: {
          name: 'Loja Com Cnpj Duplicado',
          phone: '(37) 98888-7777',
          cnpj: duplicatedStoreCnpj,
          zip_code: '35500000',
          street: 'Rua Principal',
          number: '500',
          neighborhood: 'Centro',
          city: 'Divinópolis',
          state: 'MG',
        },
        admin: {
          name: 'Admin Falha',
          email: `admin_falha_${Date.now()}@test.com`,
          password_hash: 'hash_senha_teste_123',
          phone: '(37) 99999-8888',
        },
      })
    ).rejects.toThrow();

    // Verifica que o tenant NÃO foi criado devido ao rollback
    const tenantInDb = await repository.findByCNPJ(tenantCnpj);
    expect(tenantInDb).toBeNull();
  });
});
