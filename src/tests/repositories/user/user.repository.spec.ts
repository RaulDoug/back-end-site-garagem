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
  UserRepository,
  type CreateUserData,
} from '#repositories/user.repository.js';
import pool from '#src/config/database.js';

const repository = new UserRepository();
const RUN_ID = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD_HASH =
  '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createdEmails = new Set<string>();
let sequence = 0;

const uniqueEmail = (label: string) =>
  `repo_${RUN_ID}_${++sequence}_${label}@teste.com`;

const createRepositoryUser = async (
  label: string,
  overrides: Partial<CreateUserData> = {}
) => {
  const user = await repository.create({
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

  afterEach(async () => {
    if (createdEmails.size === 0) return;

    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
      Array.from(createdEmails),
    ]);
    createdEmails.clear();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('deve buscar usuário ativo por e-mail e por id', async () => {
    const user = await createRepositoryUser('find_active');

    const byEmail = await repository.findByEmail(user.email);
    const byId = await repository.findById(user.id);

    expect(byEmail).toMatchObject({
      id: user.id,
      email: user.email,
      role: 'VENDEDOR',
    });
    expect(byId).toMatchObject({
      id: user.id,
      email: user.email,
      role: 'VENDEDOR',
    });
  });

  it('não deve retornar usuário soft-deleted em findByEmail e findById', async () => {
    const user = await createRepositoryUser('find_deleted');
    await repository.delete(user.id);

    await expect(repository.findByEmail(user.email)).resolves.toBeNull();
    await expect(repository.findById(user.id)).resolves.toBeNull();
  });

  it('deve filtrar deletados em findAll(false) e incluí-los em findAll(true)', async () => {
    const activeUser = await createRepositoryUser('find_all_active');
    const deletedUser = await createRepositoryUser('find_all_deleted');

    await repository.delete(deletedUser.id);

    const activeUsers = await repository.findAll(false);
    const allUsers = await repository.findAll(true);

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
  });

  it('deve atualizar dinamicamente apenas os campos informados', async () => {
    const user = await createRepositoryUser('update_dynamic');

    const updated = await repository.update(user.id, {
      name: 'Nome Atualizado',
      phone: '(37) 97777-6666',
    });

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

    await expect(repository.update(user.id, {})).resolves.toBeNull();

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

    const deleted = await repository.delete(user.id);

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

    const firstDelete = await repository.delete(user.id);
    expect(firstDelete).not.toBeNull();

    const secondDelete = await repository.delete(user.id);
    expect(secondDelete).toBeNull();
  });

  it('deve rejeitar criação com e-mail duplicado ativo (violação UNIQUE)', async () => {
    const user = await createRepositoryUser('unique_email');

    await expect(
      repository.create({
        name: 'Outro Usuário',
        email: user.email,
        password_hash: PASSWORD_HASH,
        phone: '(37) 96666-5555',
      })
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'idx_users_email',
    });
  });
});
