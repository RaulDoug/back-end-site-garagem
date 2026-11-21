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
  UserRepository,
  type CreateUserData,
} from '#repositories/user.repository.js';
import pool from '#src/config/database.js';
import { BadRequestError } from '#src/errors/app.error.js';

const repository = new UserRepository();
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD_HASH =
  '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createdEmails = new Set<string>();
const createdTenantIds = new Set<string>();
let sequence = 0;

const uniqueCnpj = () =>
  `${Math.floor(1000000000 + Math.random() * 9000000000)}${String(++sequence).padStart(4, '0')}`;

const uniqueEmail = (label: string) =>
  `repo_${RUN_ID}_${++sequence}_${label}@teste.com`;

let tenantA: { id: string; cnpj: string };
let tenantB: { id: string; cnpj: string };

const createRepositoryUser = async (
  label: string,
  overrides: Partial<CreateUserData> = {}
) => {
  const user = await repository.create({
    tenant_id: tenantA.id,
    name: 'Usuário de Integração',
    email: uniqueEmail(label),
    password_hash: PASSWORD_HASH,
    phone: '(37) 98888-7777',
    ...overrides,
  });

  createdEmails.add(user.email);
  return user;
};

describe('UserRepository - integração com PostgreSQL', () => {
  beforeAll(() => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error(
        'Os testes de integração do repository exigem DB_NAME terminando em _test. Execute com DB_PORT=5434 e DB_NAME=api_garage_test.'
      );
    }
  });

  beforeEach(async () => {
    const resA = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id, cnpj;`,
      ['Tenant A Corp', 'Tenant A Trade', uniqueCnpj()]
    );
    tenantA = resA.rows[0];
    createdTenantIds.add(tenantA.id);

    const resB = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id, cnpj;`,
      ['Tenant B Corp', 'Tenant B Trade', uniqueCnpj()]
    );
    tenantB = resB.rows[0];
    createdTenantIds.add(tenantB.id);
  });

  afterEach(async () => {
    if (createdEmails.size > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
        Array.from(createdEmails),
      ]);
      createdEmails.clear();
    }
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deve buscar usuário ativo por e-mail e por id', async () => {
    const user = await createRepositoryUser('find_active');

    const byEmail = await repository.findByEmail(user.email, tenantA.id);
    const byId = await repository.findById(user.id, tenantA.id);

    expect(byEmail).toMatchObject({
      id: user.id,
      email: user.email,
      tenant_id: tenantA.id,
      role: 'VENDEDOR',
    });
    expect(byId).toMatchObject({
      id: user.id,
      email: user.email,
      tenant_id: tenantA.id,
      role: 'VENDEDOR',
    });
  });

  it('não deve retornar usuário soft-deleted em findByEmail e findById', async () => {
    const user = await createRepositoryUser('find_deleted');
    await repository.delete(user.id, tenantA.id);

    await expect(repository.findByEmail(user.email, tenantA.id)).resolves.toBeNull();
    await expect(repository.findById(user.id, tenantA.id)).resolves.toBeNull();
  });

  it('deve filtrar deletados em find(includeDeleted: false) e incluí-los em find(includeDeleted: true)', async () => {
    const activeUser = await createRepositoryUser('find_all_active');
    const deletedUser = await createRepositoryUser('find_all_deleted');

    await repository.delete(deletedUser.id, tenantA.id);

    const activeUsers = await repository.find({ filters: [], includeDeleted: false });
    const allUsers = await repository.find({ filters: [], includeDeleted: true });

    const activeIds = activeUsers.map((user) => user.id);
    const allIds = allUsers.map((user) => user.id);

    expect(activeIds).toContain(activeUser.id);
    expect(activeIds).not.toContain(deletedUser.id);
    expect(allIds).toContain(activeUser.id);
    expect(allIds).toContain(deletedUser.id);
  });

  it('deve criar usuário com role padrão VENDEDOR quando role não for informada', async () => {
    const user = await createRepositoryUser('create_default_role');

    expect(user.role).toBe('VENDEDOR');
    expect(user.is_active).toBe(true);
    expect(user.deleted_at).toBeNull();
    expect(user.commission_rates).toBeNull();
  });

  it('deve atualizar dinamicamente apenas os campos informados', async () => {
    const user = await createRepositoryUser('update_dynamic');

    const updated = await repository.update(user.id, {
      name: 'Nome Atualizado',
      phone: '(37) 97777-6666',
    }, tenantA.id);

    expect(updated).toMatchObject({
      id: user.id,
      name: 'Nome Atualizado',
      phone: '(37) 97777-6666',
      email: user.email,
      role: 'VENDEDOR',
    });

    const row = await pool.query(
      'SELECT name, phone, email, role FROM users WHERE id = $1',
      [user.id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({
      name: 'Nome Atualizado',
      phone: '(37) 97777-6666',
      email: user.email,
      role: 'VENDEDOR',
    });
  });

  it('deve retornar null quando update não receber campos', async () => {
    const user = await createRepositoryUser('update_empty');

    await expect(repository.update(user.id, {}, tenantA.id)).resolves.toBeNull();

    const row = await pool.query(
      'SELECT name, phone FROM users WHERE id = $1',
      [user.id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0]).toMatchObject({
      name: user.name,
      phone: user.phone,
    });
  });

  it('deve realizar soft delete mantendo o registro no banco', async () => {
    const user = await createRepositoryUser('delete_soft');

    const deleted = await repository.delete(user.id, tenantA.id);

    expect(deleted).toMatchObject({
      id: user.id,
      is_active: false,
    });
    expect(deleted?.deleted_at).not.toBeNull();

    const row = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [user.id]
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].deleted_at).not.toBeNull();
    expect(row.rows[0].is_active).toBe(false);
  });

  it('deve retornar null ao tentar deletar um usuário já deletado (idempotência)', async () => {
    const user = await createRepositoryUser('delete_already_deleted');

    const firstDelete = await repository.delete(user.id, tenantA.id);
    expect(firstDelete).not.toBeNull();

    const secondDelete = await repository.delete(user.id, tenantA.id);
    expect(secondDelete).toBeNull();
  });

  it('deve rejeitar criação com e-mail duplicado ativo no mesmo tenant (violação UNIQUE)', async () => {
    const user = await createRepositoryUser('unique_email');

    await expect(
      repository.create({
        tenant_id: tenantA.id,
        name: 'Outro Usuário',
        email: user.email,
        password_hash: PASSWORD_HASH,
        phone: '(37) 96666-5555',
      })
    ).rejects.toMatchObject({
      code: '23505',
    });
  });

  it('deve permitir cadastrar o mesmo e-mail em dois tenants diferentes (tenantA e tenantB) e buscar cada um pelo seu tenantId em findByEmail', async () => {
    const sharedEmail = uniqueEmail('shared');

    const userA = await repository.create({
      tenant_id: tenantA.id,
      name: 'Usuário do Tenant A',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-1111',
    });
    createdEmails.add(userA.email);

    const userB = await repository.create({
      tenant_id: tenantB.id,
      name: 'Usuário do Tenant B',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-2222',
    });
    createdEmails.add(userB.email);

    expect(userA.id).not.toBe(userB.id);

    const foundInA = await repository.findByEmail(sharedEmail, tenantA.id);
    expect(foundInA).not.toBeNull();
    expect(foundInA?.id).toBe(userA.id);
    expect(foundInA?.tenant_id).toBe(tenantA.id);

    const foundInB = await repository.findByEmail(sharedEmail, tenantB.id);
    expect(foundInB).not.toBeNull();
    expect(foundInB?.id).toBe(userB.id);
    expect(foundInB?.tenant_id).toBe(tenantB.id);
  });

  it('findByEmail deve lançar BadRequestError quando tenantId for string vazia ou espaços', async () => {
    await expect(repository.findByEmail('teste@teste.com', '')).rejects.toThrow(BadRequestError);
    await expect(repository.findByEmail('teste@teste.com', '   ')).rejects.toThrow(
      'Identificador de tenant inválido'
    );
  });

  it('findAllActiveByEmail deve ignorar usuários cujo tenant ou filial vinculada estejam inativos ou soft-deleted', async () => {
    const sharedEmail = uniqueEmail('multitenant_active_tenant_store');

    const userA = await repository.create({
      tenant_id: tenantA.id,
      name: 'User A',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-1111',
    });
    createdEmails.add(userA.email);

    const resActiveStoreTenant = await pool.query<{ id: string }>(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id;`,
      ['Tenant Active Store Corp', 'Tenant Active Store Trade', uniqueCnpj()]
    );
    const activeStoreTenantId = resActiveStoreTenant.rows[0].id;
    createdTenantIds.add(activeStoreTenantId);

    const storeActiveRes = await pool.query<{ id: string }>(
      `INSERT INTO stores (
         tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
       RETURNING id;`,
      [activeStoreTenantId, 'Filial Ativa', '(37) 98888-7777', uniqueCnpj(), '35500000', 'Rua 1', '10', 'Bairro', 'Cidade', 'MG']
    );
    const storeActiveId = storeActiveRes.rows[0].id;

    const userWithActiveStore = await repository.create({
      tenant_id: activeStoreTenantId,
      store_id: storeActiveId,
      name: 'User Active Store',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-2222',
    });
    createdEmails.add(userWithActiveStore.email);

    const resInactiveTenant = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, false) RETURNING id;`,
      ['Tenant Inactive Corp', 'Tenant Inactive Trade', uniqueCnpj()]
    );
    const tenantInactiveId = resInactiveTenant.rows[0].id;
    createdTenantIds.add(tenantInactiveId);

    const userInactiveTenant = await repository.create({
      tenant_id: tenantInactiveId,
      name: 'User Inactive Tenant',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-3333',
    });
    createdEmails.add(userInactiveTenant.email);

    const storeInactiveRes = await pool.query<{ id: string }>(
      `INSERT INTO stores (
         tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false)
       RETURNING id;`,
      [tenantB.id, 'Filial Inativa', '(37) 98888-7777', uniqueCnpj(), '35500000', 'Rua 2', '20', 'Bairro', 'Cidade', 'MG']
    );
    const storeInactiveId = storeInactiveRes.rows[0].id;

    const userWithInactiveStore = await repository.create({
      tenant_id: tenantB.id,
      store_id: storeInactiveId,
      name: 'User Inactive Store',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-4444',
    });
    createdEmails.add(userWithInactiveStore.email);

    const activeUsers = await repository.findAllActiveByEmail(sharedEmail);
    const activeIds = activeUsers.map((u) => u.id);
    expect(activeIds).toContain(userA.id);
    expect(activeIds).toContain(userWithActiveStore.id);
    expect(activeIds).not.toContain(userInactiveTenant.id);
    expect(activeIds).not.toContain(userWithInactiveStore.id);
  });

  it('deve retornar todos os usuários ativos com o mesmo e-mail em findAllActiveByEmail e ignorar inativos ou soft-deleted', async () => {
    const sharedEmail = uniqueEmail('multitenant_active');

    const userA = await repository.create({
      tenant_id: tenantA.id,
      name: 'User A',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-1111',
    });
    createdEmails.add(userA.email);

    const userB = await repository.create({
      tenant_id: tenantB.id,
      name: 'User B',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-2222',
    });
    createdEmails.add(userB.email);

    const resC = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id;`,
      ['Tenant C Corp', 'Tenant C Trade', uniqueCnpj()]
    );
    const tenantCId = resC.rows[0].id;
    createdTenantIds.add(tenantCId);

    const userInactive = await repository.create({
      tenant_id: tenantCId,
      name: 'User Inactive',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-3333',
    });
    await pool.query('UPDATE users SET is_active = false WHERE id = $1', [userInactive.id]);

    const resD = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id;`,
      ['Tenant D Corp', 'Tenant D Trade', uniqueCnpj()]
    );
    const tenantDId = resD.rows[0].id;
    createdTenantIds.add(tenantDId);

    const userDeleted = await repository.create({
      tenant_id: tenantDId,
      name: 'User Deleted',
      email: sharedEmail,
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-4444',
    });
    await repository.delete(userDeleted.id, tenantDId);

    const activeUsers = await repository.findAllActiveByEmail(sharedEmail);
    expect(activeUsers).toHaveLength(2);
    const activeIds = activeUsers.map((u) => u.id);
    expect(activeIds).toContain(userA.id);
    expect(activeIds).toContain(userB.id);
    expect(activeIds).not.toContain(userInactive.id);
    expect(activeIds).not.toContain(userDeleted.id);
  });

  it('deve isolar find, findById, update e delete por tenantId', async () => {
    const userA = await createRepositoryUser('isolamento_A');
    const userB = await repository.create({
      tenant_id: tenantB.id,
      name: 'Usuário B',
      email: uniqueEmail('isolamento_b'),
      password_hash: PASSWORD_HASH,
      phone: '(37) 98888-3333',
    });
    createdEmails.add(userB.email);

    // findById com tenantB não deve encontrar userA
    const crossFind = await repository.findById(userA.id, tenantB.id);
    expect(crossFind).toBeNull();

    // update com tenantB não deve alterar userA
    const crossUpdate = await repository.update(
      userA.id,
      { name: 'Hack Name' },
      tenantB.id
    );
    expect(crossUpdate).toBeNull();
    const checkA = await repository.findById(userA.id, tenantA.id);
    expect(checkA?.name).toBe(userA.name);

    // delete com tenantB não deve deletar userA
    const crossDelete = await repository.delete(userA.id, tenantB.id);
    expect(crossDelete).toBeNull();
    const afterDelete = await repository.findById(userA.id, tenantA.id);
    expect(afterDelete?.deleted_at).toBeNull();

    // find com filtro de tenant deve listar apenas os usuários daquele tenant
    const usersOfA = await repository.find({
      filters: [{ field: 'tenant_id', operator: '=', value: tenantA.id }],
    });
    expect(usersOfA.some((u) => u.id === userA.id)).toBe(true);
    expect(usersOfA.some((u) => u.id === userB.id)).toBe(false);
  });

  describe('findAuthUserById', () => {
    it('deve retornar o usuário quando usuário e tenant estão ativos e não deletados', async () => {
      const user = await createRepositoryUser('auth_active');

      const found = await repository.findAuthUserById(user.id);

      expect(found).toMatchObject({
        id: user.id,
        email: user.email,
        tenant_id: tenantA.id,
        is_active: true,
        deleted_at: null,
      });
    });

    it('deve retornar null quando o usuário estiver inativo (is_active = false)', async () => {
      const user = await createRepositoryUser('auth_user_inactive');
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [user.id]);

      await expect(repository.findAuthUserById(user.id)).resolves.toBeNull();
    });

    it('deve retornar null quando o usuário estiver soft-deleted (deleted_at IS NOT NULL)', async () => {
      const user = await createRepositoryUser('auth_user_deleted');
      await repository.delete(user.id, tenantA.id);

      await expect(repository.findAuthUserById(user.id)).resolves.toBeNull();
    });

    it('deve retornar null quando o tenant vinculado estiver inativo (is_active = false)', async () => {
      const user = await createRepositoryUser('auth_tenant_inactive');
      await pool.query('UPDATE tenants SET is_active = false WHERE id = $1', [tenantA.id]);

      await expect(repository.findAuthUserById(user.id)).resolves.toBeNull();
    });

    it('deve retornar null quando o tenant vinculado estiver soft-deleted (deleted_at IS NOT NULL)', async () => {
      const user = await createRepositoryUser('auth_tenant_deleted');
      await pool.query('UPDATE tenants SET deleted_at = NOW() WHERE id = $1', [tenantA.id]);

      await expect(repository.findAuthUserById(user.id)).resolves.toBeNull();
    });

    const createStoreForTenantA = async (label: string): Promise<{ id: string }> => {
      const res = await pool.query<{ id: string }>(
        `INSERT INTO stores (
           tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
         RETURNING id;`,
        [
          tenantA.id,
          `Filial ${label}`,
          '(37) 98888-7777',
          uniqueCnpj(),
          '35500000',
          'Av. Automotiva',
          '1000',
          'Centro',
          'Divinópolis',
          'MG',
        ]
      );
      return res.rows[0];
    };

    it('deve retornar o usuário quando vinculado a uma filial ativa e não deletada', async () => {
      const store = await createStoreForTenantA('active');
      const user = await createRepositoryUser('auth_store_active', { store_id: store.id });

      const found = await repository.findAuthUserById(user.id);

      expect(found).toMatchObject({
        id: user.id,
        email: user.email,
        tenant_id: tenantA.id,
        store_id: store.id,
        is_active: true,
        deleted_at: null,
      });
    });

    it('deve retornar null quando a filial vinculada ao usuário estiver inativa (stores.is_active = false)', async () => {
      const store = await createStoreForTenantA('inactive');
      const user = await createRepositoryUser('auth_store_inactive', { store_id: store.id });
      await pool.query('UPDATE stores SET is_active = false WHERE id = $1', [store.id]);

      await expect(repository.findAuthUserById(user.id)).resolves.toBeNull();
    });

    it('deve retornar null quando a filial vinculada ao usuário estiver soft-deleted (stores.deleted_at IS NOT NULL)', async () => {
      const store = await createStoreForTenantA('deleted');
      const user = await createRepositoryUser('auth_store_deleted', { store_id: store.id });
      await pool.query('UPDATE stores SET deleted_at = NOW() WHERE id = $1', [store.id]);

      await expect(repository.findAuthUserById(user.id)).resolves.toBeNull();
    });
  });
});
