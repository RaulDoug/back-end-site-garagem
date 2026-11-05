import { describe, it, expect, afterAll } from 'vitest';
import { createStoreE2EContext } from './store.e2e.helpers.js';

const {
  app,
  request,
  uniqueCnpj,
  signToken,
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
  });
});

