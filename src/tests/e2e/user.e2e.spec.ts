import 'dotenv/config';
import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '#src/app.js';
import pool from '#src/config/database.js';

describe('E2E - Fluxo de Usuários e Autenticação', () => {
  let token: string;
  let createdUserId: string;

  const testUser = {
    name: 'Usuario E2E',
    email: `e2e_${Date.now()}@teste.com`,
    password: 'Password123!',
    phone: '(37) 98888-8888',
    role: 'ADMIN' as const,
  };

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', [testUser.email]);
    await pool.end();
  });

  it('deve registrar um novo usuário com sucesso (POST /api/user/register)', async () => {
    const res = await request(app)
      .post('/api/user/register')
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user).not.toHaveProperty('password_hash');

    createdUserId = res.body.user.id;
  });

  it('deve autenticar o usuário e retornar o token JWT (POST /api/user/login)', async () => {
    const res = await request(app)
      .post('/api/user/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.userInfo).toHaveProperty('token');

    token = res.body.userInfo.token;
  });

  it('deve rejeitar acesso à rota protegida sem token (GET /api/user/:id)', async () => {
    const res = await request(app).get(`/api/user/${createdUserId}`);

    expect(res.status).toBe(401);
  });

  it('deve liberar acesso à rota protegida com token Bearer válido', async () => {
    const res = await request(app)
      .get(`/api/user/${createdUserId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.userInfo.id).toBe(createdUserId);
  });
});