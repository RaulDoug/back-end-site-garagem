import { describe, it, expect, afterAll } from 'vitest';
import { createModelE2EContext } from './model.e2e.helpers.js';

const {
  app,
  request,
  uniqueModelName,
  signToken,
  createBrandForModel,
  createModel,
  cleanup,
} = createModelE2EContext();

describe('E2E - /api/models', () => {
  afterAll(cleanup);

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  describe('POST /api/models - Cadastro de Modelo', () => {
    it('deve cadastrar um modelo com sucesso quando autenticado como ADMIN (201)', async () => {
      const brandId = await createBrandForModel();
      const payload = { brand_id: brandId, name: uniqueModelName() };

      const res = await createModel(payload, adminToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('item');
      expect(res.body.item.name).toBe(payload.name);
      expect(res.body.item.brand_id).toBe(brandId);
      expect(res.body.item.is_active).toBe(true);
      expect(res.body.item.id).toBeDefined();
    });

    it('deve retornar 400 se faltar brand_id', async () => {
      const res = await createModel({ brand_id: '', name: uniqueModelName() }, adminToken);
      expect(res.status).toBe(400);
    });

    it('deve retornar 401 sem token de autorização', async () => {
      const brandId = await createBrandForModel();
      const res = await createModel({ brand_id: brandId, name: uniqueModelName() }, null);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/models - Listagem de Modelos', () => {
    it('deve listar modelos com paginação e status 200', async () => {
      const brandId = await createBrandForModel();
      await createModel({ brand_id: brandId, name: uniqueModelName() }, adminToken);

      const res = await request(app)
        .get(`/api/models?brand_id=${brandId}&page=1&limit=5`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /api/models/:id - Consulta de Modelo por ID', () => {
    it('deve retornar 200 e o modelo correspondente', async () => {
      const brandId = await createBrandForModel();
      const created = await createModel({ brand_id: brandId, name: uniqueModelName() }, adminToken);
      const modelId = created.body.item.id;

      const res = await request(app)
        .get(`/api/models/${modelId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.item.id).toBe(modelId);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .get(`/api/models/${UUID_INEXISTENTE}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/models/:id - Atualização de Modelo', () => {
    it('deve atualizar o nome do modelo com sucesso (200)', async () => {
      const brandId = await createBrandForModel();
      const created = await createModel({ brand_id: brandId, name: uniqueModelName() }, adminToken);
      const modelId = created.body.item.id;
      const novoNome = uniqueModelName();

      const res = await request(app)
        .put(`/api/models/${modelId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: novoNome });

      expect(res.status).toBe(200);
      expect(res.body.item.name).toBe(novoNome);
    });
  });

  describe('DELETE /api/models/:id - Exclusão de Modelo', () => {
    it('deve retornar 403 quando usuário VENDEDOR tentar excluir', async () => {
      const brandId = await createBrandForModel();
      const created = await createModel({ brand_id: brandId, name: uniqueModelName() }, adminToken);
      const modelId = created.body.item.id;

      const res = await request(app)
        .delete(`/api/models/${modelId}`)
        .set('Authorization', `Bearer ${vendedorToken}`);

      expect(res.status).toBe(403);
    });

    it('deve realizar soft delete com sucesso quando ADMIN (200)', async () => {
      const brandId = await createBrandForModel();
      const created = await createModel({ brand_id: brandId, name: uniqueModelName() }, adminToken);
      const modelId = created.body.item.id;

      const res = await request(app)
        .delete(`/api/models/${modelId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.item.deleted_at).not.toBeNull();
      expect(res.body.item.is_active).toBe(false);

      // Verificação de que não aparece mais no GET por ID
      const checkRes = await request(app)
        .get(`/api/models/${modelId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(checkRes.status).toBe(404);
    });
  });
});
