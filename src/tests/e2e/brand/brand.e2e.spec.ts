import { describe, it, expect, afterAll } from 'vitest';
import { createBrandE2EContext } from './brand.e2e.helpers.js';

const {
  app,
  request,
  uniqueBrandName,
  signToken,
  createBrand,
  cleanup,
} = createBrandE2EContext();

describe('E2E - /api/brands', () => {
  afterAll(cleanup);

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  describe('POST /api/brands - Cadastro de Marca', () => {
    it('deve cadastrar uma marca com sucesso quando autenticado como ADMIN (201)', async () => {
      const payload = { name: uniqueBrandName() };
      const res = await createBrand(payload, adminToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('item');
      expect(res.body.item.name).toBe(payload.name);
      expect(res.body.item.is_active).toBe(true);
      expect(res.body.item.id).toBeDefined();
    });

    it('deve retornar 400 ao enviar nome menor que 2 caracteres', async () => {
      const res = await createBrand({ name: 'A' }, adminToken);
      expect(res.status).toBe(400);
    });

    it('deve retornar 401 quando requisição não possuir token', async () => {
      const res = await createBrand({ name: uniqueBrandName() }, null);
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/brands - Listagem de Marcas', () => {
    it('deve listar marcas com paginação e status 200', async () => {
      await createBrand({ name: uniqueBrandName() }, adminToken);

      const res = await request(app)
        .get('/api/brands?page=1&limit=5')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
    });
  });

  describe('GET /api/brands/:id - Consulta de Marca por ID', () => {
    it('deve retornar 200 e a marca encontrada', async () => {
      const created = await createBrand({ name: uniqueBrandName() }, adminToken);
      const brandId = created.body.item.id;

      const res = await request(app)
        .get(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.item.id).toBe(brandId);
    });

    it('deve retornar 404 quando a marca não existir', async () => {
      const res = await request(app)
        .get(`/api/brands/${UUID_INEXISTENTE}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/brands/:id - Atualização de Marca', () => {
    it('deve atualizar o nome da marca com sucesso (200)', async () => {
      const created = await createBrand({ name: uniqueBrandName() }, adminToken);
      const brandId = created.body.item.id;
      const novoNome = uniqueBrandName();

      const res = await request(app)
        .put(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: novoNome });

      expect(res.status).toBe(200);
      expect(res.body.item.name).toBe(novoNome);
    });
  });

  describe('DELETE /api/brands/:id - Exclusão de Marca', () => {
    it('deve retornar 403 (Forbidden) quando usuário VENDEDOR tentar deletar', async () => {
      const created = await createBrand({ name: uniqueBrandName() }, adminToken);
      const brandId = created.body.item.id;

      const res = await request(app)
        .delete(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${vendedorToken}`);

      expect(res.status).toBe(403);
    });

    it('deve realizar soft delete com sucesso quando ADMIN (200)', async () => {
      const created = await createBrand({ name: uniqueBrandName() }, adminToken);
      const brandId = created.body.item.id;

      const res = await request(app)
        .delete(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.item.deleted_at).not.toBeNull();
      expect(res.body.item.is_active).toBe(false);

      // Verificação de que não aparece mais no GET por ID
      const checkRes = await request(app)
        .get(`/api/brands/${brandId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(checkRes.status).toBe(404);
    });
  });
});
