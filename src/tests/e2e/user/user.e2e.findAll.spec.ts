import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';

const { app, request, pool, uniqueEmail, register, signToken, cleanup } =
  createUserE2EContext();

describe('GET /api/users - listagem e filtro de deletados', () => {
  const getAll = (token?: string, query = '') => {
    const req = request(app).get(`/api/users${query}`);

    return token === undefined
      ? req
      : req.set('Authorization', `Bearer ${token}`);
  };

  const emailsFrom = (users: Array<Record<string, unknown>>) =>
    users.map((user) => String(user.email));

  const activeListUser = {
    name: 'Fernanda Lima',
    email: uniqueEmail('find_all_active'),
    password: 'Listagem123!',
    phone: '(37) 93333-2222',
  };

  const deletedListUser = {
    name: 'Paulo Mendes',
    email: uniqueEmail('find_all_deleted'),
    password: 'Listagem456!',
    phone: '(37) 92222-1111',
  };

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');

  beforeAll(async () => {
    const activeResponse = await register(activeListUser);
    expect(activeResponse.status).toBe(201);

    const deletedResponse = await register(deletedListUser);
    expect(deletedResponse.status).toBe(201);

    await pool.query(
      'UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = $1',
      [deletedResponse.body.user.id]
    );

    const deletedRow = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [deletedResponse.body.user.id]
    );
    expect(deletedRow.rows[0].deleted_at).not.toBeNull();
    expect(deletedRow.rows[0].is_active).toBe(false);
  });

  afterAll(cleanup);

  it('deve retornar 401 quando não houver token', async () => {
    const res = await request(app).get('/api/users');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
  });

  it('deve retornar 403 para usuário VISUALIZADOR', async () => {
    const res = await getAll(signToken('VISUALIZADOR'));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Acesso proibido. Permissão insuficiente.',
    });
  });

  it('deve retornar 403 para usuário PUBLICO', async () => {
    const res = await getAll(signToken('PUBLICO'));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Acesso proibido. Permissão insuficiente.',
    });
  });

  it('deve permitir que VENDEDOR liste os usuários', async () => {
    const res = await getAll(vendedorToken);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(emailsFrom(res.body.users)).toContain(activeListUser.email);
  });

  it('não deve retornar password_hash em nenhum item', async () => {
    const res = await getAll(vendedorToken);

    expect(res.status).toBe(200);

    const users = res.body.users as Array<Record<string, unknown>>;
    expect(users.length).toBeGreaterThan(0);

    users.forEach((user) => {
      expect(user).not.toHaveProperty('password_hash');
    });
  });

  it('deve incluir usuários deletados quando ADMIN enviar include_deleted=true', async () => {
    const res = await getAll(adminToken, '?include_deleted=true');

    expect(res.status).toBe(200);

    const emails = emailsFrom(res.body.users);
    expect(emails).toContain(activeListUser.email);
    expect(emails).toContain(deletedListUser.email);
  });

  it('deve retornar 403 quando o usuário for VENDEDOR e enviar include_deleted=true', async () => {
    const res = await getAll(vendedorToken, '?include_deleted=true');

    expect(res.status).toBe(403);
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toContain('Permissão insuficiente para incluir registros excluídos');
  });

  it('deve ignorar include_deleted com valor abc', async () => {
    const res = await getAll(adminToken, '?include_deleted=abc');

    expect(res.status).toBe(200);

    const emails = emailsFrom(res.body.users);
    expect(emails).toContain(activeListUser.email);
    expect(emails).not.toContain(deletedListUser.email);
  });

  it('deve ignorar include_deleted vazio', async () => {
    const res = await getAll(adminToken, '?include_deleted=');

    expect(res.status).toBe(200);

    const emails = emailsFrom(res.body.users);
    expect(emails).toContain(activeListUser.email);
    expect(emails).not.toContain(deletedListUser.email);
  });
});
