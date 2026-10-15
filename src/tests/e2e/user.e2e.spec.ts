import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { hashPassword } from '#utils/hash.util.js';

describe('E2E - Fluxo de Usuários e Autenticação', () => {
  let adminToken: string;
  let userToken: string;
  let createdUserId: string;

  const initialAdmin = {
    name: 'Admin Inicial',
    email: `admin_${Date.now()}@teste.com`,
    password: 'AdminPassword123!',
    phone: '(37) 99999-0000',
    role: 'ADMIN' as const,
  };

  const testUser = {
    name: 'Usuario E2E',
    email: `e2e_${Date.now()}@teste.com`,
    password: 'Password123!',
    phone: '(37) 98888-8888',
    role: 'VENDEDOR' as const,
  };

  beforeAll(async () => {
    const passwordHash = await hashPassword(initialAdmin.password);
    await pool.query(
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5)',
      [initialAdmin.name, initialAdmin.email, passwordHash, initialAdmin.phone, initialAdmin.role]
    );

    const loginRes = await request(app)
      .post('/api/user/login')
      .send({
        email: initialAdmin.email,
        password: initialAdmin.password,
      });

    adminToken = loginRes.body.userInfo.token;
  });

  afterAll(async () => {
    try {
      await pool.query('DELETE FROM users WHERE email IN ($1, $2)', [initialAdmin.email, testUser.email]);
    } catch {
      // Ignora erro caso o banco já tenha sido finalizado
    } finally {
      await pool.end();
    }
  });

  it('deve rejeitar o cadastro de usuário se não houver token (POST /api/user)', async () => {
    const res = await request(app)
      .post('/api/user')
      .send(testUser);

    expect(res.status).toBe(401);
  });

  it('deve registrar um novo usuário com sucesso quando autenticado como ADMIN (POST /api/user)', async () => {
    const res = await request(app)
      .post('/api/user')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testUser);

    expect(res.status).toBe(201);
    expect(res.body.user).toHaveProperty('id');
    expect(res.body.user.email).toBe(testUser.email);
    expect(res.body.user).not.toHaveProperty('password_hash');

    createdUserId = res.body.user.id;
  });

  it('deve autenticar o novo usuário e retornar o token JWT (POST /api/user/login)', async () => {
    const res = await request(app)
      .post('/api/user/login')
      .send({
        email: testUser.email,
        password: testUser.password,
      });

    expect(res.status).toBe(200);
    expect(res.body.userInfo).toHaveProperty('token');

    userToken = res.body.userInfo.token;
  });

  it('deve rejeitar acesso à rota protegida sem token (GET /api/user/:id)', async () => {
    const res = await request(app).get(`/api/user/${createdUserId}`);

    expect(res.status).toBe(401);
  });

  it('deve liberar acesso à rota protegida com token Bearer válido', async () => {
    const res = await request(app)
      .get(`/api/user/${createdUserId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.userInfo.id).toBe(createdUserId);
  });
});