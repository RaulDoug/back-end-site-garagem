import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import jwt from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';

describe('E2E - Suíte Completa de Isolamento Multi-Tenant & Multi-Store', () => {
  let sequence = 0;
  const createdTenantIds = new Set<string>();
  const createdGlobalBrandIds = new Set<string>();
  const createdGlobalFeatureIds = new Set<string>();

  let tenantA: { id: string; cnpj: string };
  let storeA1: { id: string; cnpj: string };
  let adminA: { id: string; email: string };
  let tokenAdminA: string;

  let tenantB: { id: string; cnpj: string };
  let storeB1: { id: string; cnpj: string };
  let adminB: { id: string; email: string };
  let tokenAdminB: string;

  let globalBrandId: string;
  let globalFeatureId: string;

  let dummyImageBuffer: Buffer;

  const nextValidCnpjs = () => {
    sequence++;
    const baseNum = (Math.floor(Date.now() / 1000) % 40000000) + 10000000 + sequence * 10;
    const calcCnpj = (base: number) => {
      const s = String(base).padStart(8, '0') + '0001';
      const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum1 = 0;
      for (let i = 0; i < 12; i++) sum1 += parseInt(s[i], 10) * w1[i];
      const r1 = sum1 % 11;
      const d1 = r1 < 2 ? 0 : 11 - r1;
      const s2 = s + d1;
      const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      let sum2 = 0;
      for (let i = 0; i < 13; i++) sum2 += parseInt(s2[i], 10) * w2[i];
      const r2 = sum2 % 11;
      const d2 = r2 < 2 ? 0 : 11 - r2;
      return `${s}${d1}${d2}`;
    };

    return {
      tenantCnpj: calcCnpj(baseNum * 2),
      storeCnpj: calcCnpj(baseNum * 2 + 1),
    };
  };

  const nextPlate = () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const l1 = letters[Math.floor(Math.random() * 26)];
    const l2 = letters[Math.floor(Math.random() * 26)];
    const l3 = letters[Math.floor(Math.random() * 26)];
    const l4 = letters[Math.floor(Math.random() * 26)];
    const d1 = Math.floor(Math.random() * 10);
    const d2 = Math.floor(Math.random() * 10);
    const d3 = Math.floor(Math.random() * 10);
    return `${l1}${l2}${l3}${d1}${l4}${d2}${d3}`;
  };

  beforeAll(async () => {
    if (!process.env.DB_NAME?.endsWith('_test')) {
      throw new Error('Testes E2E exigem DB_NAME terminando em _test.');
    }
    dummyImageBuffer = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await pool.query(
        'DELETE FROM vehicle_photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE tenant_id = ANY($1::uuid[]))',
        [ids]
      );
      await pool.query(
        'DELETE FROM vehicle_features WHERE vehicle_id IN (SELECT id FROM vehicles WHERE tenant_id = ANY($1::uuid[]))',
        [ids]
      );
      await pool.query('DELETE FROM vehicles WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM models WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM brands WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM features WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('UPDATE users SET store_id = NULL WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
    }

    if (createdGlobalBrandIds.size > 0) {
      await pool.query('DELETE FROM models WHERE brand_id = ANY($1::uuid[])', [
        Array.from(createdGlobalBrandIds),
      ]);
      await pool.query('DELETE FROM brands WHERE id = ANY($1::uuid[])', [
        Array.from(createdGlobalBrandIds),
      ]);
      createdGlobalBrandIds.clear();
    }
    if (createdGlobalFeatureIds.size > 0) {
      await pool.query('DELETE FROM features WHERE id = ANY($1::uuid[])', [
        Array.from(createdGlobalFeatureIds),
      ]);
      createdGlobalFeatureIds.clear();
    }

    await pool.end();
  });

  describe('Cenário 1: Onboarding Transacional (Tenant A e Tenant B)', () => {
    it('deve realizar onboarding transacional de Tenant A com sucesso e retornar token com tenantId e storeId', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();

      const res = await request(app)
        .post('/api/tenants/onboard')
        .send({
          tenant: {
            corporate_name: 'Holding Alpha Veiculos Ltda',
            trade_name: 'Alpha Motors',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Alpha Matriz',
            phone: '(37) 98888-1111',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Av. Alpha',
            number: '100',
            neighborhood: 'Centro',
            city: 'Divinópolis',
            state: 'MG',
          },
          admin: {
            name: 'Admin Alpha',
            email: `admin_alpha_${Date.now()}@alpha.com`,
            password: 'StrongPassword123!',
            phone: '(37) 99999-1111',
            cpf: '123.456.789-09',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('tenant');
      expect(res.body).toHaveProperty('store');
      expect(res.body).toHaveProperty('admin');
      expect(res.body).toHaveProperty('token');

      tenantA = { id: res.body.tenant.id, cnpj: res.body.tenant.cnpj };
      storeA1 = { id: res.body.store.id, cnpj: res.body.store.cnpj };
      adminA = { id: res.body.admin.id, email: res.body.admin.email };
      expect(adminA.id).toBeDefined();
      tokenAdminA = res.body.token;

      createdTenantIds.add(tenantA.id);

      const decoded = jwt.decode(tokenAdminA) as { tenantId?: string; storeId?: string; role?: string };
      expect(decoded.tenantId).toBe(tenantA.id);
      expect(decoded.storeId).toBe(storeA1.id);
      expect(decoded.role).toBe('ADMIN');
    });

    it('deve realizar onboarding transacional de Tenant B com sucesso e retornar token com tenantId e storeId', async () => {
      const { tenantCnpj, storeCnpj } = nextValidCnpjs();

      const res = await request(app)
        .post('/api/tenants/onboard')
        .send({
          tenant: {
            corporate_name: 'Holding Beta Veiculos Ltda',
            trade_name: 'Beta Motors',
            cnpj: tenantCnpj,
          },
          store: {
            name: 'Beta Matriz',
            phone: '(37) 98888-2222',
            cnpj: storeCnpj,
            zip_code: '35500-000',
            street: 'Av. Beta',
            number: '200',
            neighborhood: 'Centro',
            city: 'Divinópolis',
            state: 'MG',
          },
          admin: {
            name: 'Admin Beta',
            email: `admin_beta_${Date.now()}@beta.com`,
            password: 'StrongPassword123!',
            phone: '(37) 99999-2222',
            cpf: '987.654.321-00',
          },
        });

      expect(res.status).toBe(201);
      tenantB = { id: res.body.tenant.id, cnpj: res.body.tenant.cnpj };
      storeB1 = { id: res.body.store.id, cnpj: res.body.store.cnpj };
      adminB = { id: res.body.admin.id, email: res.body.admin.email };
      tokenAdminB = res.body.token;

      createdTenantIds.add(tenantB.id);

      const decoded = jwt.decode(tokenAdminB) as { tenantId?: string; storeId?: string; role?: string };
      expect(decoded.tenantId).toBe(tenantB.id);
      expect(decoded.storeId).toBe(storeB1.id);
      expect(decoded.role).toBe('ADMIN');
    });
  });

  describe('Cenário 2: Isolamento Cross-Tenant de Lojas e Usuários', () => {
    it('Admin A não deve conseguir ler, editar ou deletar a loja Store B1 do Tenant B (404)', async () => {
      // GET
      const getRes = await request(app)
        .get(`/api/stores/${storeB1.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(getRes.status).toBe(404);

      // PUT
      const putRes = await request(app)
        .put(`/api/stores/${storeB1.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ name: 'Tentativa Invasão Loja B' });
      expect(putRes.status).toBe(404);

      // DELETE
      const delRes = await request(app)
        .delete(`/api/stores/${storeB1.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(delRes.status).toBe(404);
    });

    it('Admin A não deve conseguir ler, editar ou deletar o usuário Admin B do Tenant B (404)', async () => {
      // GET
      const getRes = await request(app)
        .get(`/api/users/${adminB.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(getRes.status).toBe(404);

      // PUT
      const putRes = await request(app)
        .put(`/api/users/${adminB.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ name: 'Nome Hackeado' });
      expect(putRes.status).toBe(404);

      // DELETE
      const delRes = await request(app)
        .delete(`/api/users/${adminB.id}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(delRes.status).toBe(404);
    });
  });

  describe('Cenário 3: Proteção do Catálogo Híbrido (brands e features)', () => {
    beforeAll(async () => {
      // Inserção direta de marca e opcional globais (tenant_id IS NULL)
      const brandRes = await pool.query(
        'INSERT INTO brands (name, tenant_id) VALUES ($1, NULL) RETURNING id',
        [`Global_Brand_${Date.now()}`]
      );
      globalBrandId = brandRes.rows[0].id;
      createdGlobalBrandIds.add(globalBrandId);

      const featRes = await pool.query(
        'INSERT INTO features (name, tenant_id) VALUES ($1, NULL) RETURNING id',
        [`Global_Feature_${Date.now()}`]
      );
      globalFeatureId = featRes.rows[0].id;
      createdGlobalFeatureIds.add(globalFeatureId);
    });

    it('ambos Tenant A e Tenant B devem enxergar marcas e opcionais globais', async () => {
      const brandsARes = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(brandsARes.status).toBe(200);
      expect(brandsARes.body.items.some((b: { id: string }) => b.id === globalBrandId)).toBe(true);

      const brandsBRes = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(brandsBRes.status).toBe(200);
      expect(brandsBRes.body.items.some((b: { id: string }) => b.id === globalBrandId)).toBe(true);

      const featARes = await request(app)
        .get('/api/features')
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(featARes.status).toBe(200);
      expect(featARes.body.items.some((f: { id: string }) => f.id === globalFeatureId)).toBe(true);

      const featBRes = await request(app)
        .get('/api/features')
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(featBRes.status).toBe(200);
      expect(featBRes.body.items.some((f: { id: string }) => f.id === globalFeatureId)).toBe(true);
    });

    it('Admin A não deve conseguir alterar ou deletar itens globais (403 Forbidden)', async () => {
      // Tentar alterar marca global
      const putBrandRes = await request(app)
        .put(`/api/brands/${globalBrandId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ name: 'Marca Global Alterada' });
      expect(putBrandRes.status).toBe(403);
      expect(putBrandRes.body.message).toMatch(/global/i);

      // Tentar deletar marca global
      const delBrandRes = await request(app)
        .delete(`/api/brands/${globalBrandId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(delBrandRes.status).toBe(403);
      expect(delBrandRes.body.message).toMatch(/global/i);

      // Tentar alterar opcional global
      const putFeatRes = await request(app)
        .put(`/api/features/${globalFeatureId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ name: 'Opcional Global Alterado' });
      expect(putFeatRes.status).toBe(403);
      expect(putFeatRes.body.message).toMatch(/global/i);

      // Tentar deletar opcional global
      const delFeatRes = await request(app)
        .delete(`/api/features/${globalFeatureId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(delFeatRes.status).toBe(403);
      expect(delFeatRes.body.message).toMatch(/global/i);
    });

    it('Admin A cria uma marca própria que não deve ser visível para Tenant B', async () => {
      const customBrandName = `Custom_Alpha_Brand_${Date.now()}`;
      const createRes = await request(app)
        .post('/api/brands')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ name: customBrandName });
      expect(createRes.status).toBe(201);
      const customBrandId = createRes.body.item.id;

      // Tenant A enxerga a marca
      const getARes = await request(app)
        .get(`/api/brands/${customBrandId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(getARes.status).toBe(200);
      expect(getARes.body.item.id).toBe(customBrandId);

      // Tenant B NÃO enxerga a marca (404)
      const getBRes = await request(app)
        .get(`/api/brands/${customBrandId}`)
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(getBRes.status).toBe(404);

      // Listagem do Tenant B não inclui a marca personalizada do Tenant A
      const listBRes = await request(app)
        .get('/api/brands')
        .set('Authorization', `Bearer ${tokenAdminB}`);
      expect(listBRes.body.items.some((b: { id: string }) => b.id === customBrandId)).toBe(false);
    });
  });

  describe('Cenário 4: Isolamento Cross-Tenant de Veículos e Mídias', () => {
    let vehicleAId: string;
    let vehicleBId: string;
    let modelAId: string;
    let modelBId: string;
    const sharedPlate = nextPlate();

    beforeAll(async () => {
      // Modelos para Tenant A e Tenant B usando a marca global
      const modelARes = await request(app)
        .post('/api/models')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ brand_id: globalBrandId, name: `Modelo_Alpha_${Date.now()}` });
      modelAId = modelARes.body.item.id;

      const modelBRes = await request(app)
        .post('/api/models')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .send({ brand_id: globalBrandId, name: `Modelo_Beta_${Date.now()}` });
      modelBId = modelBRes.body.item.id;
    });

    it('deve permitir que Tenant A e Tenant B cadastrem veículos com a mesma placa (201)', async () => {
      // Veículo Tenant A
      const resA = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          store_id: storeA1.id,
          model_id: modelAId,
          sale_type: 'PROPRIO',
          title: 'Carro Alpha Placa Gêmea',
          description: 'Veículo teste placa repetida',
          sale_price: 80000,
          purchase_price: 65000,
          manufacture_year: 2021,
          model_year: 2022,
          mileage: 30000,
          transmission: 'MANUAL',
          color: 'Prata',
          category: 'HATCH',
          fuel_type: 'FLEX',
          steering: 'Elétrica',
          doors: 4,
          full_license_plate: sharedPlate,
          feature_ids: [globalFeatureId],
        });
      expect(resA.status).toBe(201);
      vehicleAId = resA.body.item.id;

      // Veículo Tenant B com a MESMA placa
      const resB = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${tokenAdminB}`)
        .send({
          store_id: storeB1.id,
          model_id: modelBId,
          sale_type: 'PROPRIO',
          title: 'Carro Beta Placa Gêmea',
          description: 'Veículo teste placa repetida tenant b',
          sale_price: 85000,
          purchase_price: 70000,
          manufacture_year: 2021,
          model_year: 2022,
          mileage: 35000,
          transmission: 'AUTOMATICO',
          color: 'Preto',
          category: 'SUV',
          fuel_type: 'FLEX',
          steering: 'Elétrica',
          doors: 4,
          full_license_plate: sharedPlate,
          feature_ids: [globalFeatureId],
        });
      expect(resB.status).toBe(201);
      vehicleBId = resB.body.item.id;
    });

    it('Admin A não deve conseguir atualizar, deletar ou enviar foto para o veículo do Tenant B (404)', async () => {
      // PUT
      const putRes = await request(app)
        .put(`/api/vehicles/${vehicleBId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ color: 'Amarelo' });
      expect(putRes.status).toBe(404);

      // DELETE
      const delRes = await request(app)
        .delete(`/api/vehicles/${vehicleBId}`)
        .set('Authorization', `Bearer ${tokenAdminA}`);
      expect(delRes.status).toBe(404);

      // POST photos
      const photoRes = await request(app)
        .post(`/api/vehicles/${vehicleBId}/photos`)
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .attach('photos', dummyImageBuffer, 'foto.jpg');
      expect(photoRes.status).toBe(404);
    });

    it('vitrine pública com filtro por tenant_id deve retornar apenas os veículos do respectivo tenant', async () => {
      const publicARes = await request(app).get(`/api/vehicles?tenant_id=${tenantA.id}`);
      expect(publicARes.status).toBe(200);
      expect(publicARes.body.items.some((v: { id: string }) => v.id === vehicleAId)).toBe(true);
      expect(publicARes.body.items.some((v: { id: string }) => v.id === vehicleBId)).toBe(false);

      const publicBRes = await request(app).get(`/api/vehicles?tenant_id=${tenantB.id}`);
      expect(publicBRes.status).toBe(200);
      expect(publicBRes.body.items.some((v: { id: string }) => v.id === vehicleBId)).toBe(true);
      expect(publicBRes.body.items.some((v: { id: string }) => v.id === vehicleAId)).toBe(false);
    });

    it('vitrine pública deve retornar 404 para tenant_id inexistente e para store_id de outro tenant sem revelar vínculo', async () => {
      const ghostTenantRes = await request(app).get(
        '/api/vehicles?tenant_id=00000000-0000-4000-8000-000000000000'
      );
      expect(ghostTenantRes.status).toBe(404);
      expect(ghostTenantRes.body.message).toBe('Empresa não encontrada');

      const crossStoreRes = await request(app)
        .get(`/api/vehicles?tenant_id=${tenantA.id}&store_id=${storeB1.id}`);
      expect(crossStoreRes.status).toBe(404);
      expect(crossStoreRes.body.message).toBe('Loja não encontrada');
    });
  });

  describe('Cenário 5: Restrição Multi-Store (Filial Store A1 vs Store A2)', () => {
    let storeA2Id: string;
    let sellerStoreA1Token: string;
    let vehicleInStoreA1Id: string;

    it('Admin A cria uma segunda filial Store A2', async () => {
      const { storeCnpj } = nextValidCnpjs();
      const createStoreRes = await request(app)
        .post('/api/stores')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          name: 'Alpha Filial 2',
          phone: '(37) 98888-3333',
          cnpj: storeCnpj,
          zip_code: '35500-000',
          street: 'Av. Secundária',
          number: '202',
          neighborhood: 'Bairro Novo',
          city: 'Divinópolis',
          state: 'MG',
        });

      expect(createStoreRes.status).toBe(201);
      storeA2Id = createStoreRes.body.item.id;
    });

    it('Admin A cria vendedor vinculado exclusivamente à Store A1', async () => {
      const sellerEmail = `vendedor_a1_${Date.now()}@alpha.com`;
      const createUserRes = await request(app)
        .post('/api/users/register')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({
          name: 'Vendedor Exclusivo Loja A1',
          email: sellerEmail,
          password: 'Password123!',
          phone: '(37) 98888-4444',
          role: 'VENDEDOR',
          store_id: storeA1.id,
        });

      expect(createUserRes.status).toBe(201);
      const sellerId = createUserRes.body.user.id;

      // Gera token autenticado do vendedor com storeId = storeA1.id
      sellerStoreA1Token = jwt.sign(
        {
          id: sellerId,
          email: sellerEmail,
          role: 'VENDEDOR',
          tenantId: tenantA.id,
          storeId: storeA1.id,
        },
        process.env.JWT_SECRET || 'default-secret',
        { expiresIn: '1h' }
      );
    });

    it('vendedor da Store A1 deve receber 403 ao tentar cadastrar veículo na Store A2', async () => {
      const modelRes = await request(app)
        .post('/api/models')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ brand_id: globalBrandId, name: `Modelo_Filial_${Date.now()}` });
      const modelId = modelRes.body.item.id;

      const resForbidden = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${sellerStoreA1Token}`)
        .send({
          store_id: storeA2Id, // Tentativa cruzada de loja
          model_id: modelId,
          sale_type: 'PROPRIO',
          title: 'Tentativa Proibida Store A2',
          description: 'Não deve permitir criação em outra filial',
          sale_price: 90000,
          purchase_price: 75000,
          manufacture_year: 2022,
          model_year: 2023,
          mileage: 10000,
          transmission: 'AUTOMATICO',
          color: 'Cinza',
          category: 'SEDÃ',
          fuel_type: 'FLEX',
          steering: 'Elétrica',
          doors: 4,
          full_license_plate: nextPlate(),
          feature_ids: [],
        });

      expect(resForbidden.status).toBe(403);
      expect(resForbidden.body.message).toMatch(/própria filial/i);
    });

    it('vendedor da Store A1 cadastra com sucesso na sua própria filial Store A1 (201)', async () => {
      const modelRes = await request(app)
        .post('/api/models')
        .set('Authorization', `Bearer ${tokenAdminA}`)
        .send({ brand_id: globalBrandId, name: `Modelo_Permitido_${Date.now()}` });
      const modelId = modelRes.body.item.id;

      const resSuccess = await request(app)
        .post('/api/vehicles')
        .set('Authorization', `Bearer ${sellerStoreA1Token}`)
        .send({
          store_id: storeA1.id, // Própria filial
          model_id: modelId,
          sale_type: 'PROPRIO',
          title: 'Veículo Autorizado Store A1',
          description: 'Criado pelo vendedor da própria filial',
          sale_price: 95000,
          purchase_price: 80000,
          manufacture_year: 2022,
          model_year: 2023,
          mileage: 12000,
          transmission: 'AUTOMATICO',
          color: 'Branco',
          category: 'SEDÃ',
          fuel_type: 'FLEX',
          steering: 'Elétrica',
          doors: 4,
          full_license_plate: nextPlate(),
          feature_ids: [],
        });

      expect(resSuccess.status).toBe(201);
      vehicleInStoreA1Id = resSuccess.body.item.id;
    });

    it('vendedor da Store A1 deve receber 403 ao tentar transferir veículo para a Store A2 via PUT', async () => {
      const resForbiddenUpdate = await request(app)
        .put(`/api/vehicles/${vehicleInStoreA1Id}`)
        .set('Authorization', `Bearer ${sellerStoreA1Token}`)
        .send({ store_id: storeA2Id });

      expect(resForbiddenUpdate.status).toBe(403);
      expect(resForbiddenUpdate.body.message).toMatch(/própria filial/i);
    });
  });
});
