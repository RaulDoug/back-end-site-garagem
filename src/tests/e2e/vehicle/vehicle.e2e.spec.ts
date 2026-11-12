import { describe, it, expect, afterAll } from 'vitest';
import { createVehicleE2EContext } from './vehicle.e2e.helpers.js';

const {
  app,
  request,
  signToken,
  uniquePlate,
  validProprioPayload,
  validConsignadoPayload,
  createVehicle,
  createTenant,
  createTenantUser,
  createStoreForTenant,
  cleanup,
  getTenantId,
  getStoreId,
  getFeatureIds,
} = createVehicleE2EContext();

describe('E2E - Módulo de Veículos (/api/vehicles)', () => {
  afterAll(cleanup);

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const viewerToken = signToken('VISUALIZADOR');
  const tenantId = getTenantId();
  const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

  describe('POST /api/vehicles - Cadastro de Veículo (UC06)', () => {
    it('deve cadastrar veículo PROPRIO com sucesso quando autenticado como ADMIN (201)', async () => {
      const payload = validProprioPayload();
      const res = await createVehicle(payload, adminToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('item');
      expect(res.body.item.id).toBeDefined();
      expect(res.body.item.sale_type).toBe('PROPRIO');
      expect(res.body.item.title).toBe(payload.title);
      expect(res.body.item.registered_by_user_id).toBeDefined();
      expect(res.body.item.plate_last_digit).toBe(Number(payload.full_license_plate.slice(-1)));
    });

    it('deve cadastrar veículo CONSIGNADO com sucesso quando autenticado como VENDEDOR (201)', async () => {
      const payload = validConsignadoPayload();
      const res = await createVehicle(payload, vendedorToken);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('item');
      expect(res.body.item.sale_type).toBe('CONSIGNADO');
      expect(res.body.item.owner_name).toBe(payload.owner_name);
      expect(res.body.item.purchase_price).toBeNull();
    });

    it('deve retornar 400 se veículo PROPRIO for enviado sem purchase_price ou CONSIGNADO sem owner_price', async () => {
      const payloadProprio = validProprioPayload({ purchase_price: undefined });
      const resProprio = await createVehicle(payloadProprio, adminToken);
      expect(resProprio.status).toBe(400);
      expect(resProprio.body).toHaveProperty('errors');

      const payloadConsignado = validConsignadoPayload({ owner_price: undefined });
      const resConsignado = await createVehicle(payloadConsignado, adminToken);
      expect(resConsignado.status).toBe(400);
      expect(resConsignado.body).toHaveProperty('errors');
    });

    it('deve retornar 409 ao tentar cadastrar duas vezes a mesma placa ativa no mesmo tenant', async () => {
      const plate = uniquePlate();
      const payload1 = validProprioPayload({ full_license_plate: plate });
      const payload2 = validProprioPayload({ full_license_plate: plate });

      const res1 = await createVehicle(payload1, adminToken);
      expect(res1.status).toBe(201);

      const res2 = await createVehicle(payload2, adminToken);
      expect(res2.status).toBe(409);
    });

    it('deve retornar 401 sem token e 403 se usuário for VISUALIZADOR', async () => {
      const payload = validProprioPayload();

      const resNoToken = await createVehicle(payload, null);
      expect(resNoToken.status).toBe(401);

      const resViewer = await createVehicle(payload, viewerToken);
      expect(resViewer.status).toBe(403);
    });
  });

  describe('GET /api/vehicles - Vitrine Pública (UC01, RN001, RN002, RN003)', () => {
    it('deve retornar status 200 apenas com veículos ATIVO/RESERVADO (RN002) e dados sensíveis omitidos (RN003)', async () => {
      const createdAtivo = await createVehicle(validProprioPayload({ status: 'ATIVO' }), adminToken);
      const createdVendido = await createVehicle(validProprioPayload({ status: 'VENDIDO' }), adminToken);
      const vehicleId = createdAtivo.body.item.id;
      const vendidoId = createdVendido.body.item.id;

      const res = await request(app)
        .get('/api/vehicles?page=1&limit=48')
        .set('x-tenant-id', tenantId);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body).toHaveProperty('total');
      expect(Array.isArray(res.body.items)).toBe(true);

      const ids = res.body.items.map((item: Record<string, unknown>) => item.id);
      expect(ids).toContain(vehicleId);
      expect(ids).not.toContain(vendidoId);

      const found = res.body.items.find((item: Record<string, unknown>) => item.id === vehicleId);
      expect(found).toBeDefined();

      // RN003: Validação de LGPD para rota pública
      expect(found).not.toHaveProperty('full_license_plate');
      expect(found).not.toHaveProperty('purchase_price');
      expect(found).not.toHaveProperty('owner_price');
      expect(found).not.toHaveProperty('owner_name');
      expect(found).not.toHaveProperty('owner_contact');
      expect(found).toHaveProperty('plate_last_digit');
      expect(found).toHaveProperty('sale_price');
    });

    it('RN001: filtro por GASOLINA deve incluir veículos cadastrados como FLEX', async () => {
      const flexCar = await createVehicle(
        validProprioPayload({ fuel_type: 'FLEX' }),
        adminToken
      );

      const res = await request(app)
        .get('/api/vehicles?fuel_type=GASOLINA&limit=48')
        .set('x-tenant-id', tenantId);

      expect(res.status).toBe(200);
      const ids = res.body.items.map((i: Record<string, unknown>) => i.id);
      expect(ids).toContain(flexCar.body.item.id);
    });

    it('deve filtrar por feature_ids retornando apenas veículos que possuem todos os opcionais solicitados', async () => {
      const [feat1, feat2] = getFeatureIds();
      const carBoth = await createVehicle(
        validProprioPayload({ feature_ids: [feat1, feat2] }),
        adminToken
      );
      const carOnlyOne = await createVehicle(
        validProprioPayload({ feature_ids: [feat1] }),
        adminToken
      );

      const res = await request(app)
        .get(`/api/vehicles?feature_ids=${feat1},${feat2}&limit=48`)
        .set('x-tenant-id', tenantId);

      expect(res.status).toBe(200);
      const ids = res.body.items.map((i: Record<string, unknown>) => i.id);
      expect(ids).toContain(carBoth.body.item.id);
      expect(ids).not.toContain(carOnlyOne.body.item.id);
    });
  });

  describe('GET /api/vehicles/admin - Listagem Administrativa (UC06, RN003)', () => {
    it('deve retornar todos os status, placa completa e valores financeiros para ADMIN e VENDEDOR (RN003)', async () => {
      const created = await createVehicle(validProprioPayload({ status: 'VENDIDO' }), adminToken);
      const vehicleId = created.body.item.id;

      const resAdmin = await request(app)
        .get('/api/vehicles/admin?limit=48')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resAdmin.status).toBe(200);
      const foundAdmin = resAdmin.body.items.find((i: Record<string, unknown>) => i.id === vehicleId);
      expect(foundAdmin).toBeDefined();
      expect(foundAdmin).toHaveProperty('full_license_plate');
      expect(foundAdmin).toHaveProperty('purchase_price');

      const resSeller = await request(app)
        .get('/api/vehicles/admin?limit=48')
        .set('Authorization', `Bearer ${vendedorToken}`);

      expect(resSeller.status).toBe(200);
      const foundSeller = resSeller.body.items.find((i: Record<string, unknown>) => i.id === vehicleId);
      expect(foundSeller).toBeDefined();
      expect(foundSeller).toHaveProperty('full_license_plate');
    });

    it('deve ocultar dados sensíveis para perfil VISUALIZADOR na rota admin (RN003)', async () => {
      const created = await createVehicle(validProprioPayload({ status: 'INATIVO' }), adminToken);
      const vehicleId = created.body.item.id;

      const res = await request(app)
        .get('/api/vehicles/admin?limit=48')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      const found = res.body.items.find((i: Record<string, unknown>) => i.id === vehicleId);
      expect(found).toBeDefined();
      expect(found).not.toHaveProperty('full_license_plate');
      expect(found).not.toHaveProperty('purchase_price');
    });
  });

  describe('GET /api/vehicles/:id vs GET /api/vehicles/admin/:id - Detalhes e Anti-Fraude (RN007)', () => {
    it('deve retornar 200 com opcionais, marca e modelo e incrementar total_views apenas +1 em chamadas repetidas do mesmo IP/User-Agent', async () => {
      const [feat1] = getFeatureIds();
      const created = await createVehicle(
        validProprioPayload({ feature_ids: [feat1] }),
        adminToken
      );
      const vehicleId = created.body.item.id;

      // 1ª chamada pública: incrementa total_views de 0 para 1
      const res1 = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('x-tenant-id', tenantId)
        .set('User-Agent', 'Browser-Teste-E2E/1.0');

      expect(res1.status).toBe(200);
      expect(res1.body.item.id).toBe(vehicleId);
      expect(res1.body.item.total_views).toBe(1);

      // 2ª chamada pública mesmo IP/User-Agent: NÃO deve incrementar
      const res2 = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('x-tenant-id', tenantId)
        .set('User-Agent', 'Browser-Teste-E2E/1.0');

      expect(res2.status).toBe(200);
      expect(res2.body.item.total_views).toBe(1);

      // Rota administrativa não incrementa visualização
      const resAdmin = await request(app)
        .get(`/api/vehicles/admin/${vehicleId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.item.total_views).toBe(1);
    });

    it('deve retornar 404 para ID inexistente', async () => {
      const res = await request(app)
        .get(`/api/vehicles/${UUID_INEXISTENTE}`)
        .set('x-tenant-id', tenantId);
      expect(res.status).toBe(404);
    });
  });

  describe('PUT & DELETE /api/vehicles/:id - Atualização e Exclusão', () => {
    it('deve atualizar o veículo com sucesso (200)', async () => {
      const created = await createVehicle(validProprioPayload(), adminToken);
      const vehicleId = created.body.item.id;

      const res = await request(app)
        .put(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ sale_price: 135000, color: 'Vermelho' });

      expect(res.status).toBe(200);
      expect(Number(res.body.item.sale_price)).toBe(135000);
      expect(res.body.item.color).toBe('Vermelho');
    });

    it('deve retornar 403 se VENDEDOR tentar deletar e 200 se ADMIN deletar', async () => {
      const created = await createVehicle(validProprioPayload(), adminToken);
      const vehicleId = created.body.item.id;

      const resVendedor = await request(app)
        .delete(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${vendedorToken}`);
      expect(resVendedor.status).toBe(403);

      const resAdmin = await request(app)
        .delete(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.item.status).toBe('INATIVO');
      expect(resAdmin.body.item.deleted_at).not.toBeNull();
    });
  });

  describe('Multi-tenant & Multi-store: Isolamento Absoluto de Veículos', () => {
    it('deve permitir a mesma placa em tenants diferentes', async () => {
      const tenantB = await createTenant('Tenant Veiculos B E2E');
      const storeB = await createStoreForTenant(tenantB.id, 'Loja B');
      const userB = await createTenantUser(tenantB.id, 'ADMIN');

      // Modelo e Marca próprios do Tenant B
      const brandBRes = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ name: `Marca_Tenant_B_${Date.now()}` });
      const modelBRes = await request(app)
        .post('/api/models')
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ brand_id: brandBRes.body.item.id, name: `Modelo_Tenant_B_${Date.now()}` });
      const modelBId = modelBRes.body.item.id;

      const sharedPlate = uniquePlate();

      // Tenant A cria veículo com placa compartilhada
      const resA = await createVehicle(
        validProprioPayload({ full_license_plate: sharedPlate }),
        adminToken
      );
      expect(resA.status).toBe(201);
      const vehicleAId = resA.body.item.id;

      // Tenant B cria veículo com a MESMA placa (deve ser 201)
      const resB = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${userB.token}`)
        .send(
          validProprioPayload({
            store_id: storeB,
            model_id: modelBId,
            feature_ids: [],
            full_license_plate: sharedPlate,
          })
        );
      expect(resB.status).toBe(201);

      // Usuário do Tenant B tenta ler veículo do Tenant A no admin -> 404
      const resGetB = await request(app)
        .get(`/api/vehicles/admin/${vehicleAId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(resGetB.status).toBe(404);

      // Usuário do Tenant B tenta editar veículo do Tenant A -> 404
      const resPutB = await request(app)
        .put(`/api/vehicles/${vehicleAId}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ color: 'Azul' });
      expect(resPutB.status).toBe(404);

      // Usuário do Tenant B tenta deletar veículo do Tenant A -> 404
      const resDelB = await request(app)
        .delete(`/api/vehicles/${vehicleAId}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(resDelB.status).toBe(404);
    });

    it('deve restringir vendedor de filial específica a criar/editar apenas na sua filial (403)', async () => {
      const store1 = getStoreId();
      const store2 = await createStoreForTenant(tenantId, 'Filial 2');

      // Cria vendedor vinculado exclusivamente à store1
      const filialSeller = await createTenantUser(tenantId, 'VENDEDOR', store1);

      // Vendedor tenta cadastrar veículo apontando para store2 -> 403 Forbidden
      const resForbiddenCreate = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${filialSeller.token}`)
        .send(validProprioPayload({ store_id: store2 }));
      expect(resForbiddenCreate.status).toBe(403);
      expect(resForbiddenCreate.body.message).toMatch(/própria filial/i);

      // Vendedor cadastra com sucesso na sua filial store1 -> 201 Created
      const resSuccessCreate = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${filialSeller.token}`)
        .send(validProprioPayload({ store_id: store1 }));
      expect(resSuccessCreate.status).toBe(201);
      const vehicleId = resSuccessCreate.body.item.id;

      // Vendedor tenta transferir o veículo para store2 no PUT -> 403 Forbidden
      const resForbiddenUpdate = await request(app)
        .put(`/api/vehicles/${vehicleId}`)
        .set('Authorization', `Bearer ${filialSeller.token}`)
        .send({ store_id: store2 });
      expect(resForbiddenUpdate.status).toBe(403);
      expect(resForbiddenUpdate.body.message).toMatch(/própria filial/i);
    });
  });
});
