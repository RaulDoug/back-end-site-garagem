import { describe, it, expect, afterAll } from 'vitest';
import { createFeatureE2EContext } from './feature.e2e.helpers.js';

const {
  app,
  request,
  uniqueFeatureName,
  signToken,
  createFeature,
  cleanup,
} = createFeatureE2EContext();

describe('E2E - /api/features', () => {
  afterAll(cleanup);

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  describe('POST /api/features - Cadastro de Opcional', () => {
    it('deve cadastrar um opcional com sucesso quando autenticado (201)', async () => {
      const payload = { name: uniqueFeatureName() };
      const res = await createFeature(payload, adminToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('item');
      expect(res.body.item.name).toBe(payload.name);
      expect(res.body.item.id).toBeDefined();
    });

    it('deve retornar 400 ao enviar nome menor que 2 caracteres', async () => {
      const res = await createFeature({ name: 'X' }, adminToken);
      expect(res.status).toBe(400);
    });

    it('deve retornar 401 se não enviar token', async () => {
      const res = await createFeature({ name: uniqueFeatureName() }, null);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/features - Listagem de Opcionais', () => {
    it('deve listar opcionais com status 200', async () => {
      await createFeature({ name: uniqueFeatureName() }, adminToken);

      const res = await request(app)
        .get('/api/features?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /api/features/:id - Consulta de Opcional por ID', () => {
    it('deve retornar 200 e o opcional correspondente', async () => {
      const created = await createFeature({ name: uniqueFeatureName() }, adminToken);
      const featureId = created.body.item.id;

      const res = await request(app)
        .get(`/api/features/${featureId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.item.id).toBe(featureId);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .get(`/api/features/${UUID_INEXISTENTE}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/features/:id - Atualização de Opcional', () => {
    it('deve atualizar o nome do opcional com sucesso (200)', async () => {
      const created = await createFeature({ name: uniqueFeatureName() }, adminToken);
      const featureId = created.body.item.id;
      const novoNome = uniqueFeatureName();

      const res = await request(app)
        .put(`/api/features/${featureId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: novoNome });

      expect(res.status).toBe(200);
      expect(res.body.item.name).toBe(novoNome);
    });
  });

  describe('DELETE /api/features/:id - Exclusão de Opcional', () => {
    it('deve retornar 403 quando usuário VENDEDOR tentar excluir', async () => {
      const created = await createFeature({ name: uniqueFeatureName() }, adminToken);
      const featureId = created.body.item.id;

      const res = await request(app)
        .delete(`/api/features/${featureId}`)
        .set('Authorization', `Bearer ${vendedorToken}`);

      expect(res.status).toBe(403);
    });

    it('deve deletar fisicamente o opcional com sucesso quando ADMIN (200)', async () => {
      const created = await createFeature({ name: uniqueFeatureName() }, adminToken);
      const featureId = created.body.item.id;

      const res = await request(app)
        .delete(`/api/features/${featureId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      // Verificação de que não é mais encontrado
      const checkRes = await request(app)
        .get(`/api/features/${featureId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(checkRes.status).toBe(404);
    });
  });
});
