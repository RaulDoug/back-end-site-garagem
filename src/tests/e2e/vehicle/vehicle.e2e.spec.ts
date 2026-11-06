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
  cleanup,
  getFeatureIds,
} = createVehicleE2EContext();

describe('E2E - Módulo de Veículos (/api/vehicles)', () => {
  afterAll(cleanup);

  const adminToken = signToken('ADMIN');
  const vendedorToken = signToken('VENDEDOR');
  const viewerToken = signToken('VISUALIZADOR');
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

    it('deve retornar 409 ao tentar cadastrar duas vezes a mesma placa ativa', async () => {
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

      const res = await request(app).get('/api/vehicles?page=1&limit=48');

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

      const res = await request(app).get('/api/vehicles?fuel_type=GASOLINA&limit=48');

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

      const res = await request(app).get(`/api/vehicles?feature_ids=${feat1},${feat2}&limit=48`);

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
        .set('User-Agent', 'Browser-Teste-E2E/1.0');

      expect(res1.status).toBe(200);
      expect(res1.body.item.id).toBe(vehicleId);
      expect(res1.body.item).toHaveProperty('brand');
      expect(res1.body.item).toHaveProperty('model');
      expect(res1.body.item).toHaveProperty('features');
      expect(res1.body.item).not.toHaveProperty('full_license_plate');
      expect(res1.body.item.total_views).toBe(1);

      // 2ª chamada pública seguida do mesmo IP e User-Agent: mantém total_views em 1
      const res2 = await request(app)
        .get(`/api/vehicles/${vehicleId}`)
        .set('User-Agent', 'Browser-Teste-E2E/1.0');

      expect(res2.status).toBe(200);
      expect(res2.body.item.total_views).toBe(1);

      // Chamada na rota administrativa (/admin/:id): NUNCA incrementa total_views e retorna dados completos
      const resAdmin = await request(app)
        .get(`/api/vehicles/admin/${vehicleId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .set('User-Agent', 'Outro-Browser-Admin/2.0');

      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.item.total_views).toBe(1);
      expect(resAdmin.body.item).toHaveProperty('full_license_plate');
    });

    it('deve retornar 404 quando o veículo não existir', async () => {
      const res = await request(app).get(`/api/vehicles/${UUID_INEXISTENTE}`);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/vehicles/compare - Comparador de Veículos (UC02)', () => {
    it('deve retornar os veículos comparados lado a lado (200)', async () => {
      const car1 = await createVehicle(validProprioPayload(), adminToken);
      const car2 = await createVehicle(validProprioPayload(), adminToken);

      const res = await request(app).get(
        `/api/vehicles/compare?ids=${car1.body.item.id},${car2.body.item.id}`
      );

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('items');
      expect(res.body.items.length).toBe(2);
      expect(res.body.items[0]).not.toHaveProperty('full_license_plate');
    });

    it('deve retornar 400 se enviar apenas 1 veículo ou mais de 3 veículos', async () => {
      const car1 = await createVehicle(validProprioPayload(), adminToken);

      const res1 = await request(app).get(`/api/vehicles/compare?ids=${car1.body.item.id}`);
      expect(res1.status).toBe(400);

      const resMany = await request(app).get(
        `/api/vehicles/compare?ids=${car1.body.item.id},${UUID_INEXISTENTE},${UUID_INEXISTENTE},${UUID_INEXISTENTE}`
      );
      expect(resMany.status).toBe(400);
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
});
