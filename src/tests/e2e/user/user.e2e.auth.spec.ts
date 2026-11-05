import { describe, it, expect, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';

const { app, request, uniqueEmail, register, login, cleanup, UUID_REGEX } =
  createUserE2EContext();

describe('E2E - Fluxo principal de autenticação', () => {
  let token: string;
  let createdUserId: string;

  const testUser = {
    name: 'Usuario E2E',
    email: uniqueEmail('auth'),
    password: 'Password123!',
    phone: '(37) 98888-8888',
    role: 'ADMIN' as const,
  };

  afterAll(cleanup);

  it('deve registrar um novo usuário com sucesso (POST /api/users/register)', async () => {
    const res = await register(testUser);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Usuário criado com sucesso!');
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.id).toMatch(UUID_REGEX);
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user).not.toHaveProperty('password_hash');

    createdUserId = res.body.user.id;
  });

  it('deve autenticar o usuário e retornar o token JWT (POST /api/users/login)', async () => {
    const res = await login({
      email: testUser.email,
      password: testUser.password,
    });

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Login realizado com sucesso!');
    expect(res.body.userInfo).toHaveProperty('token');
    expect(res.body.userInfo.user.email).toBe(testUser.email);
    expect(res.body.userInfo.user).not.toHaveProperty('password_hash');

    token = res.body.userInfo.token;
  });

  it('deve rejeitar acesso à rota protegida sem token (GET /api/users/:id)', async () => {
    const res = await request(app).get(`/api/users/${createdUserId}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(
      'Acesso negado. Token não fornecido ou inválido'
    );
  });

  it('deve liberar acesso à rota protegida com token Bearer válido', async () => {
    const res = await request(app)
      .get(`/api/users/${createdUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userInfo.id).toBe(createdUserId);
    expect(res.body.userInfo).not.toHaveProperty('password_hash');
  });
});
