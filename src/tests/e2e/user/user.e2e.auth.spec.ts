import { describe, it, expect, afterAll } from 'vitest';
import { createUserE2EContext } from './user.e2e.helpers.js';
import { hashPassword } from '#utils/hash.util.js';

const { app, pool, request, uniqueEmail, register, login, signToken, createTenant, cleanup, UUID_REGEX } =
  createUserE2EContext();

describe('E2E - Fluxo principal de autenticação e isolamento', () => {
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

  describe('Isolamento Cross-Tenant (Tenant A vs Tenant B)', () => {
    it('garante que o Admin do Tenant A não consegue listar, visualizar, editar ou excluir um usuário do Tenant B', async () => {
      // 1. Cria Tenant B
      const tenantB = await createTenant('Empresa Usuários B');

      // 2. Insere um usuário diretamente no Tenant B
      const userBEmail = uniqueEmail('tenant_b_user');
      const insertRes = await pool.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, phone, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'VENDEDOR'::users_roles_types, true)
         RETURNING id, email;`,
        [
          tenantB.id,
          'Vendedor Tenant B',
          userBEmail,
          '$2b$10$KIXQJ1Z5F1Z5F1Z5F1Z5F.1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F',
          '(37) 98888-2222',
        ]
      );
      const userB = insertRes.rows[0];

      const adminTokenTenantA = signToken('ADMIN');

      // 3. Admin Tenant A tenta visualizar usuário do Tenant B -> 404
      const getRes = await request(app)
        .get(`/api/users/${userB.id}`)
        .set('Authorization', `Bearer ${adminTokenTenantA}`);
      expect(getRes.status).toBe(404);

      // 4. Admin Tenant A tenta editar usuário do Tenant B -> 404
      const putRes = await request(app)
        .put(`/api/users/${userB.id}`)
        .set('Authorization', `Bearer ${adminTokenTenantA}`)
        .send({ name: 'Invasor Alterando Nome' });
      expect(putRes.status).toBe(404);

      // 5. Admin Tenant A tenta excluir usuário do Tenant B -> 404
      const delRes = await request(app)
        .delete(`/api/users/${userB.id}`)
        .set('Authorization', `Bearer ${adminTokenTenantA}`);
      expect(delRes.status).toBe(404);

      // 6. Admin Tenant A listando usuários não visualiza o usuário do Tenant B
      const listRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminTokenTenantA}`);
      expect(listRes.status).toBe(200);
      const users = listRes.body.users || [];
      expect(users.some((u: { id: string }) => u.id === userB.id)).toBe(false);
    });

    it('deve exigir tenant_id ao fazer login se o mesmo e-mail existir em mais de um tenant ativo', async () => {
      const tenant1 = await createTenant('Empresa Multi 1');
      const tenant2 = await createTenant('Empresa Multi 2');
      const sharedEmail = uniqueEmail('shared_login');
      const password = 'Password123!';
      const hash = await hashPassword(password);

      await pool.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, phone, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'VENDEDOR'::users_roles_types, true);`,
        [tenant1.id, 'Usuário Tenant 1', sharedEmail, hash, '(37) 98888-1111']
      );

      await pool.query(
        `INSERT INTO users (tenant_id, name, email, password_hash, phone, role, is_active)
         VALUES ($1, $2, $3, $4, $5, 'VENDEDOR'::users_roles_types, true);`,
        [tenant2.id, 'Usuário Tenant 2', sharedEmail, hash, '(37) 98888-2222']
      );

      // 1. Login sem tenant_id -> 400
      const loginSemTenant = await login({
        email: sharedEmail,
        password,
      });
      expect(loginSemTenant.status).toBe(400);

      // 2. Login com tenant_id informado -> 200
      const loginComTenant2 = await login({
        email: sharedEmail,
        password,
        tenant_id: tenant2.id,
      });
      expect(loginComTenant2.status).toBe(200);
      expect(loginComTenant2.body.userInfo.user.tenant_id).toBe(tenant2.id);
    });
  });
});
