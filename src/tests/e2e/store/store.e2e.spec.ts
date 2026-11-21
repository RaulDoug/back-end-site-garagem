import { describe, it, expect, afterAll } from 'vitest';
import { createStoreE2EContext, DEFAULT_TENANT_ID } from './store.e2e.helpers.js';

const {
  app,
  request,
  pool,
  uniqueCnpj,
  signToken,
  createTenant,
  createStoreDirectly,
  validStorePayload,
  createStore,
  cleanup,
} = createStoreE2EContext();

describe('E2E - /api/stores', () => {
  afterAll(cleanup);

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  describe('POST /api/stores - Cadastro de Loja', () => {
    it('deve criar uma nova loja com sucesso quando autenticado como ADMIN (201)', async () => {
      const payload = validStorePayload({ name: 'Loja Matriz Centro' });

      const response = await createStore(payload, adminToken);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('item');
      expect(response.body.item).toMatchObject({
        name: 'Loja Matriz Centro',
        phone: payload.phone,
        cnpj: payload.cnpj,
        street: payload.street,
        number: payload.number,
        is_active: true,
      });
      expect(response.body.item.id).toBeDefined();
    });

    it('deve retornar 409 quando o CNPJ já estiver cadastrado', async () => {
      const cnpj = uniqueCnpj();
      const payload1 = validStorePayload({ cnpj });
      const payload2 = validStorePayload({ cnpj, name: 'Loja Colisão' });

      const res1 = await createStore(payload1, adminToken);
      expect(res1.status).toBe(201);

      const res2 = await createStore(payload2, adminToken);
      expect(res2.status).toBe(409);
      expect(res2.body.message).toMatch(/cnpj.*(cadastrado|uso)/i);
    });

    it('deve retornar 400 quando faltarem campos obrigatórios no schema Zod', async () => {
      const response = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Incompleta' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('errors');
    });

    it('deve retornar 401 ao tentar cadastrar sem token de autorização', async () => {
      const response = await createStore(validStorePayload(), null);

      expect(response.status).toBe(401);
    });

    it('deve retornar 403 ao tentar cadastrar com perfil não-ADMIN (ex: VENDEDOR)', async () => {
      const response = await createStore(validStorePayload(), vendedorToken);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/stores/:id - Consulta de Loja por ID', () => {
    it('deve retornar a loja quando o ID existir (200)', async () => {
      const created = await createStore(validStorePayload(), adminToken);
      const storeId = created.body.item.id;

      const response = await request(app)
        .get(`/api/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.item.id).toBe(storeId);
    });

    it('deve retornar 404 quando a loja não existir', async () => {
      const response = await request(app)
        .get(`/api/stores/${UUID_INEXISTENTE}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('deve retornar 400 quando o ID não for um UUID válido', async () => {
      const response = await request(app)
        .get('/api/stores/id-invalido-123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/stores/public/:id - Consulta Pública da Vitrine (Sem autenticação)', () => {
    it('deve retornar dados públicos da loja sem token (200)', async () => {
      const created = await createStore(validStorePayload({ name: 'Loja Vitrine Pública' }), adminToken);
      const storeId = created.body.item.id;

      const response = await request(app).get(`/api/stores/public/${storeId}`);

      expect(response.status).toBe(200);
      expect(response.body.item).toMatchObject({
        id: storeId,
        name: 'Loja Vitrine Pública',
      });
    });

    it('deve retornar 404 ao consultar loja pública inexistente', async () => {
      const response = await request(app).get(`/api/stores/public/${UUID_INEXISTENTE}`);

      expect(response.status).toBe(404);
    });

    it('deve retornar 404 ao consultar loja pública cujo tenant esteja inativo', async () => {
      const tenant = await createTenant('Tenant Inativo Vitrine');
      const store = await createStoreDirectly(tenant.id, {
        name: 'Loja de Tenant Inativo',
      });

      await pool.query('UPDATE tenants SET is_active = false WHERE id = $1', [tenant.id]);

      const response = await request(app).get(`/api/stores/public/${store.id}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/stores/:id - Atualização de Loja', () => {
    it('deve atualizar os dados da loja com sucesso (200)', async () => {
      const created = await createStore(validStorePayload(), adminToken);
      const storeId = created.body.item.id;

      const response = await request(app)
        .put(`/api/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Nome Atualizado E2E' });

      expect(response.status).toBe(200);
      expect(response.body.item.name).toBe('Nome Atualizado E2E');
    });

    it('deve retornar 409 ao tentar atualizar para um CNPJ já pertencente a outra loja', async () => {
      const loja1 = await createStore(validStorePayload(), adminToken);
      const loja2 = await createStore(validStorePayload(), adminToken);

      const response = await request(app)
        .put(`/api/stores/${loja2.body.item.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ cnpj: loja1.body.item.cnpj });

      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/cnpj.*(uso|cadastrado)/i);
    });

    it('deve retornar 403 se um usuário não-ADMIN tentar atualizar', async () => {
      const created = await createStore(validStorePayload(), adminToken);

      const response = await request(app)
        .put(`/api/stores/${created.body.item.id}`)
        .set('Authorization', `Bearer ${vendedorToken}`)
        .send({ name: 'Tentativa Vendedor' });

      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/stores/:id - Soft Delete de Loja', () => {
    it('deve realizar soft delete da loja com sucesso (200)', async () => {
      const created = await createStore(validStorePayload(), adminToken);
      const storeId = created.body.item.id;

      const deleteResponse = await request(app)
        .delete(`/api/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteResponse.status).toBe(200);

      // Verificação de que a loja agora retorna 404 em consultas normais
      const getResponse = await request(app)
        .get(`/api/stores/${storeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('deve retornar 404 ao tentar deletar ID inexistente', async () => {
      const response = await request(app)
        .delete(`/api/stores/${UUID_INEXISTENTE}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

    it('deve retornar 403 se um não-ADMIN tentar deletar', async () => {
      const created = await createStore(validStorePayload(), adminToken);

      const response = await request(app)
        .delete(`/api/stores/${created.body.item.id}`)
        .set('Authorization', `Bearer ${vendedorToken}`);

      expect(response.status).toBe(403);
    });

    it('deve retornar 409 ao tentar deletar uma loja que possui usuário ativo vinculado', async () => {
      const created = await createStore(validStorePayload(), adminToken);
      const storeId = created.body.item.id;

      const userEmail = `e2e.dep.${Date.now()}@garagem.com`;
      const userRes = await pool.query(
        `INSERT INTO users (tenant_id, store_id, name, email, password_hash, phone, role, is_active)
         VALUES ($1, $2, 'Vendedor Vinculado', $3, 'hash123', '(37) 99999-0000', 'VENDEDOR'::users_roles_types, true)
         RETURNING id`,
        [DEFAULT_TENANT_ID, storeId, userEmail]
      );
      const userId = userRes.rows[0].id;

      try {
        const response = await request(app)
          .delete(`/api/stores/${storeId}`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).toBe(409);
        expect(response.body.message).toMatch(
          /não é possível excluir loja com usuários ou veículos ativos/i
        );
      } finally {
        await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      }
    });
  });

  describe('Isolamento Multi-Tenant (Tenant A vs Tenant B)', () => {
    it('deve retornar 404 quando o Admin do Tenant A tentar consultar, editar ou deletar loja do Tenant B', async () => {
      // Cria Tenant B e uma loja para Tenant B
      const tenantB = await createTenant('Empresa Concorrente B');
      const storeB = await createStoreDirectly(tenantB.id, {
        name: 'Loja Exclusiva do Tenant B',
      });

      // 1. Admin do Tenant A tenta consultar loja do Tenant B -> 404
      const getRes = await request(app)
        .get(`/api/stores/${storeB.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);

      // 1.1 Admin do Tenant A tenta consultar loja do Tenant B por CNPJ -> 404
      const cnpjRes = await request(app)
        .get(`/api/stores/cnpj/${storeB.cnpj}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(cnpjRes.status).toBe(404);

      // 2. Admin do Tenant A tenta editar loja do Tenant B -> 404
      const putRes = await request(app)
        .put(`/api/stores/${storeB.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Invasão Tentativa' });
      expect(putRes.status).toBe(404);

      // 3. Admin do Tenant A tenta deletar loja do Tenant B -> 404
      const delRes = await request(app)
        .delete(`/api/stores/${storeB.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delRes.status).toBe(404);

      // 4. Admin do Tenant A listando lojas não deve ver loja do Tenant B
      const listRes = await request(app)
        .get('/api/stores')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      const items = listRes.body.items || [];
      expect(items.some((item: { id: string }) => item.id === storeB.id)).toBe(false);
    });
  });
});
