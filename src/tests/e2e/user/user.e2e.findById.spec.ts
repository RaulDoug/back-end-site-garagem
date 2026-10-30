import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';

const { app, request, pool, uniqueEmail, register, signToken, cleanup } =
  createUserE2EContext();

describe('GET /api/user/:id - autorização e casos de borda', () => {
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  const getById = (id: string, token?: string) => {
    const req = request(app).get(`/api/user/${id}`);

    return token === undefined
      ? req
      : req.set('Authorization', `Bearer ${token}`);
  };

  const targetUser = {
    name: 'Carlos Almeida',
    email: uniqueEmail('get_by_id_target'),
    password: 'ConsultaSegura123!',
    phone: '(37) 95555-4444',
  };

  const deletedUser = {
    name: 'Usuário Excluído',
    email: uniqueEmail('get_by_id_deleted'),
    password: 'Excluido123!',
    phone: '(37) 94444-3333',
  };

  let targetUserId: string;
  let deletedUserId: string;
  let vendedorToken: string;

  beforeAll(async () => {
    const targetResponse = await register(targetUser);
    expect(targetResponse.status).toBe(201);
    targetUserId = targetResponse.body.user.id;

    const deletedResponse = await register(deletedUser);
    expect(deletedResponse.status).toBe(201);
    deletedUserId = deletedResponse.body.user.id;

    await pool.query(
      'UPDATE users SET deleted_at = NOW(), is_active = false WHERE id = $1',
      [deletedUserId]
    );

    const deletedRow = await pool.query(
      'SELECT deleted_at, is_active FROM users WHERE id = $1',
      [deletedUserId]
    );
    expect(deletedRow.rows[0].deleted_at).not.toBeNull();
    expect(deletedRow.rows[0].is_active).toBe(false);

    vendedorToken = signToken('VENDEDOR');
  });

  afterAll(cleanup);

  it('deve retornar 400 quando o id não for um UUID', async () => {
    const res = await getById('id-invalido', vendedorToken);

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
    const res = await getById(UUID_INEXISTENTE, vendedorToken);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Usuário inexistente.' });
  });

  it('deve retornar 404 quando o usuário estiver deletado', async () => {
    const res = await getById(deletedUserId, vendedorToken);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Usuário inexistente.' });
  });

  it('deve retornar 401 quando o token for malformado', async () => {
    const res = await getById(targetUserId, 'token-malformado');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token inválido ou expirado.' });
  });

  it('deve retornar 401 quando o token estiver expirado', async () => {
    const expiredToken = signToken('VENDEDOR', { expiresIn: -1 });
    const res = await getById(targetUserId, expiredToken);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token inválido ou expirado.' });
  });

  it('deve retornar 401 quando a assinatura do token estiver errada', async () => {
    const tokenComAssinaturaErrada = signToken(
      'VENDEDOR',
      {},
      'segredo-incorreto'
    );
    const res = await getById(targetUserId, tokenComAssinaturaErrada);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Token inválido ou expirado.' });
  });

  it('deve retornar 401 quando o token não tiver o prefixo Bearer', async () => {
    const res = await request(app)
      .get(`/api/user/${targetUserId}`)
      .set('Authorization', vendedorToken);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
  });

  it('deve retornar 401 quando o prefixo bearer estiver em minúsculo', async () => {
    const res = await request(app)
      .get(`/api/user/${targetUserId}`)
      .set('Authorization', `bearer ${vendedorToken}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
  });

  it('deve retornar 401 quando o Bearer estiver vazio', async () => {
    const res = await request(app)
      .get(`/api/user/${targetUserId}`)
      .set('Authorization', 'Bearer ');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      message: 'Acesso negado. Token não fornecido ou inválido',
    });
  });

  it('deve retornar 403 para usuário VISUALIZADOR', async () => {
    const res = await getById(targetUserId, signToken('VISUALIZADOR'));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Acesso proibido. Permissão insuficiente.',
    });
  });

  it('deve retornar 403 para usuário PUBLICO', async () => {
    const res = await getById(targetUserId, signToken('PUBLICO'));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      message: 'Acesso proibido. Permissão insuficiente.',
    });
  });

  it('deve permitir que VENDEDOR consulte um usuário', async () => {
    const res = await getById(targetUserId, vendedorToken);

    expect(res.status).toBe(200);
    expect(res.body.userInfo).toMatchObject({
      id: targetUserId,
      name: targetUser.name,
      email: targetUser.email,
      phone: targetUser.phone,
      role: 'VENDEDOR',
    });
  });

  it('deve retornar a resposta sem password_hash', async () => {
    const res = await getById(targetUserId, vendedorToken);

    expect(res.status).toBe(200);
    expect(res.body.userInfo).not.toHaveProperty('password_hash');
    expect(res.body.userInfo).not.toHaveProperty('password');
  });

  it('deve retornar 400 antes de exigir autenticação quando o id for inválido', async () => {
    const res = await request(app).get('/api/user/id-invalido');

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
});
