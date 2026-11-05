import { describe, it, expect, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';

const { app, request, pool, uniqueEmail, register, login, signToken, cleanup } =
  createUserE2EContext();

describe('DELETE /api/users/:id - exclusão e casos de borda', () => {
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');

  const deleteUser = (id: string, token?: string) => {
    const req = request(app).delete(`/api/users/${id}`);

    return token === undefined
      ? req
      : req.set('Authorization', `Bearer ${token}`);
  };

  const getById = (id: string, token: string) =>
    request(app)
      .get(`/api/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

  const getAll = (token: string) =>
    request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

  const baseUser = (label: string) => ({
    name: 'Usuário para Exclusão',
    email: uniqueEmail(label),
    password: 'Exclusao123!',
    phone: '(37) 91111-2222',
  });

  const userIdsFrom = (users: Array<Record<string, unknown>>) =>
    users.map((user) => String(user.id));

  afterAll(cleanup);

  it('deve deletar o usuário como ADMIN e removê-lo das consultas e do login', async () => {
    const user = baseUser('delete_success');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await deleteUser(id, adminToken);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Usuário deletado com sucesso!');
    expect(res.body.userInfo).toMatchObject({
      id,
      email: user.email,
      is_active: false,
    });
    expect(res.body.userInfo.deleted_at).not.toBeNull();
    expect(res.body.userInfo).not.toHaveProperty('password_hash');

    const byId = await getById(id, adminToken);
    expect(byId.status).toBe(404);
    expect(byId.body).toEqual({ message: 'Usuário inexistente.' });

    const list = await getAll(adminToken);
    expect(list.status).toBe(200);
    expect(userIdsFrom(list.body.users)).not.toContain(id);

    const attemptLogin = await login({
      email: user.email,
      password: user.password,
    });
    expect(attemptLogin.status).toBe(401);
    expect(attemptLogin.body).toEqual({ message: 'Credenciais inválidas' });
  });

  it('deve manter o registro no banco com deleted_at preenchido e is_active=false', async () => {
    const user = baseUser('delete_database');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await deleteUser(id, adminToken);
    expect(res.status).toBe(200);

    const row = await pool.query(
      'SELECT email, deleted_at, is_active FROM users WHERE id = $1',
      [id]
    );

    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].email).toBe(user.email);
    expect(row.rows[0].deleted_at).not.toBeNull();
    expect(row.rows[0].is_active).toBe(false);
  });

  it('deve retornar 401 quando não houver token e não deletar o usuário', async () => {
    const user = baseUser('delete_no_token');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await deleteUser(id);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });

    const row = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [id]
    );
    expect(row.rows[0].deleted_at).toBeNull();
    expect(row.rows[0].is_active).toBe(true);
  });

  it('deve retornar 403 para usuário VENDEDOR e não deletar o usuário', async () => {
    const user = baseUser('delete_vendedor');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const res = await deleteUser(id, vendedorToken);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Acesso proibido. Permissão insuficiente.',
    });

    const row = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [id]
    );
    expect(row.rows[0].deleted_at).toBeNull();
    expect(row.rows[0].is_active).toBe(true);
  });

  it('deve retornar 400 quando o id não for um UUID', async () => {
    const res = await deleteUser('id-invalido', adminToken);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      status: 'fail',
      errors: [
        {
          field: 'params.id',
          message: 'ID do usuário inválido',
        },
      ],
    });
  });

  it('deve retornar 404 quando o UUID não existir', async () => {
    const res = await deleteUser(UUID_INEXISTENTE, adminToken);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Usuário inexistente.' });
  });

  it('não deve permitir que o ADMIN delete a própria conta', async () => {
    const user = baseUser('delete_twice');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const first = await deleteUser(id, adminToken);
    expect(first.status).toBe(200);

    const second = await deleteUser(id, adminToken);
    expect(second.status).toBe(404);
    expect(second.body).toEqual({ message: 'Usuário inexistente.' });
  });

  it('deve documentar o comportamento atual ao ADMIN deletar a própria conta', async () => {
    const user = baseUser('delete_self');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    await pool.query('UPDATE users SET role = \'ADMIN\' WHERE id = $1', [id]);

    const auth = await login({
      email: user.email,
      password: user.password,
    });
    expect(auth.status).toBe(200);
    expect(auth.body.userInfo.user.role).toBe('ADMIN');

    const res = await deleteUser(id, auth.body.userInfo.token);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'Não é possível deletar o próprio usuário.' });

    const row = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [id]
    );
    expect(row.rows[0].deleted_at).toBeNull();
    expect(row.rows[0].is_active).toBe(true);
  });

  it('não deve continuar aceitando o token de um usuário deletado (caracterização 4.7)', async () => {
    const user = baseUser('delete_token');
    const created = await register(user);
    expect(created.status).toBe(201);
    const id = created.body.user.id;

    const auth = await login({
      email: user.email,
      password: user.password,
    });
    expect(auth.status).toBe(200);
    const token = auth.body.userInfo.token;

    const deleted = await deleteUser(id, adminToken);
    expect(deleted.status).toBe(200);

    const res = await getAll(token);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Acesso negado. Token não fornecido ou inválido' });
  });
});
