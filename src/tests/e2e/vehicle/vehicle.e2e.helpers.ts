import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

export const DEFAULT_VEHICLE_TENANT_ID = '55555555-5555-5555-8555-555555555555';

export const createVehicleE2EContext = () => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let sequence = 0;
  const contextTenantId = randomUUID();
  const tokenAdminId = randomUUID();
  const tokenSellerId = randomUUID();
  const tokenViewerId = randomUUID();

  let storeId: string;
  let modelId: string;
  let brandId: string;
  let featureId1: string;
  let featureId2: string;

  const createdVehicleIds = new Set<string>();
  const createdTenantIds = new Set<string>();

  beforeAll(async () => {
    // 1. Cria Tenant isolado para o contexto de teste
    const cnpj = `${Math.floor(10000000000000 + Math.random() * 90000000000000)}`.slice(0, 14);
    await pool.query(
      `INSERT INTO tenants (id, corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, $4, true);`,
      [
        contextTenantId,
        `Tenant Veiculos E2E ${runId}`,
        `Garagem E2E ${runId}`,
        cnpj,
      ]
    );

    // 2. Seed dos usuários de teste para cada perfil no tenant
    const userQuery = `
      INSERT INTO users (id, tenant_id, name, email, password_hash, phone, role, is_active)
      VALUES 
        ($1, $4, 'Admin E2E', $5, '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '(37) 99999-0001', 'ADMIN', true),
        ($2, $4, 'Vendedor E2E', $6, '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '(37) 99999-0002', 'VENDEDOR', true),
        ($3, $4, 'Viewer E2E', $7, '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '(37) 99999-0003', 'VISUALIZADOR', true);
    `;
    await pool.query(userQuery, [
      tokenAdminId,
      tokenSellerId,
      tokenViewerId,
      contextTenantId,
      `admin.vehicle.${runId}@garagem.com`,
      `seller.vehicle.${runId}@garagem.com`,
      `viewer.vehicle.${runId}@garagem.com`,
    ]);

    // 3. Seed de Loja
    const storeCnpj = `${Math.floor(10000000000000 + Math.random() * 90000000000000)}`.slice(0, 14);
    const storeRes = await pool.query(
      `INSERT INTO stores (tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state)
       VALUES ($1, $2, '(37) 98888-1111', $3, '35500000', 'Rua E2E', '100', 'Centro', 'Divinópolis', 'MG')
       RETURNING id`,
      [contextTenantId, `Loja E2E ${runId}`, storeCnpj]
    );
    storeId = storeRes.rows[0].id;

    // 4. Seed de Marca e Modelo
    const brandRes = await pool.query(
      'INSERT INTO brands (name, tenant_id) VALUES ($1, $2) RETURNING id',
      [`Marca E2E ${runId}`, contextTenantId]
    );
    brandId = brandRes.rows[0].id;

    const modelRes = await pool.query(
      'INSERT INTO models (tenant_id, brand_id, name) VALUES ($1, $2, $3) RETURNING id',
      [contextTenantId, brandId, `Modelo E2E ${runId}`]
    );
    modelId = modelRes.rows[0].id;

    // 5. Seed de Features
    const feat1 = await pool.query(
      'INSERT INTO features (name, tenant_id) VALUES ($1, $2) RETURNING id',
      [`Teto Solar ${runId}`, contextTenantId]
    );
    const feat2 = await pool.query(
      'INSERT INTO features (name, tenant_id) VALUES ($1, $2) RETURNING id',
      [`Bancos Couro ${runId}`, contextTenantId]
    );
    featureId1 = feat1.rows[0].id;
    featureId2 = feat2.rows[0].id;
  });

  const signToken = (
    role: TokenRole = 'ADMIN',
    options: SignOptions = {},
    secret = JWT_SECRET,
    userId?: string,
    tenantId = contextTenantId,
    userStoreId: string | null = null
  ) => {
    const id =
      userId ||
      (role === 'ADMIN'
        ? tokenAdminId
        : role === 'VENDEDOR'
          ? tokenSellerId
          : role === 'VISUALIZADOR'
            ? tokenViewerId
            : tokenAdminId);

    return jwt.sign(
      {
        id,
        email: `${role.toLowerCase()}@teste.com`,
        role,
        tenantId,
        storeId: userStoreId,
      },
      secret,
      { expiresIn: '1h', ...options }
    );
  };

  const createTenantUser = async (
    tenantId: string,
    role: TokenRole = 'ADMIN',
    storeIdToBind: string | null = null
  ) => {
    const userId = randomUUID();
    const email = `tenant_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@garagem.com`;
    await pool.query(
      `INSERT INTO users (id, tenant_id, store_id, name, email, password_hash, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::users_roles_types, true)`,
      [
        userId,
        tenantId,
        storeIdToBind,
        'Tenant User',
        email,
        '$2b$10$KIXQJ1Z5F1Z5F1Z5F1Z5F.1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F',
        '(37) 99999-7777',
        role,
      ]
    );
    return {
      userId,
      email,
      token: jwt.sign(
        { id: userId, email, role, tenantId, storeId: storeIdToBind },
        JWT_SECRET,
        { expiresIn: '1h' }
      ),
    };
  };

  const createTenant = async (name = 'Outro Tenant') => {
    const cnpj = `${String(Math.floor(1000000000 + Math.random() * 9000000000)).slice(0, 10)}${Math.floor(1000 + Math.random() * 9000)}`.slice(0, 14);
    const res = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id, cnpj;`,
      [`${name} Corp`, name, cnpj]
    );
    const tenant = res.rows[0];
    createdTenantIds.add(tenant.id);
    return tenant;
  };

  const createStoreForTenant = async (tenantId: string, name = 'Filial') => {
    const cnpj = `${Math.floor(10000000000000 + Math.random() * 90000000000000)}`.slice(0, 14);
    const res = await pool.query(
      `INSERT INTO stores (tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state)
       VALUES ($1, $2, '(37) 98888-2222', $3, '35500000', 'Rua Filial', '200', 'Centro', 'Cidade', 'MG')
       RETURNING id`,
      [tenantId, `${name} ${runId}_${++sequence}`, cnpj]
    );
    return res.rows[0].id as string;
  };

  const uniquePlate = () => {
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

  const validProprioPayload = (overrides: Record<string, unknown> = {}) => ({
    store_id: storeId,
    model_id: modelId,
    sale_type: 'PROPRIO',
    title: `Veículo E2E ${runId} ${++sequence}`,
    description: 'Carro em excelente estado para testes E2E',
    sale_price: 110000,
    purchase_price: 90000,
    manufacture_year: 2022,
    model_year: 2023,
    mileage: 25000,
    transmission: 'AUTOMATICO',
    color: 'Branco',
    category: 'SEDÃ',
    fuel_type: 'FLEX',
    steering: 'Elétrica',
    doors: 4,
    full_license_plate: uniquePlate(),
    feature_ids: [featureId1, featureId2],
    ...overrides,
  });

  const validConsignadoPayload = (overrides: Record<string, unknown> = {}) => ({
    store_id: storeId,
    model_id: modelId,
    sale_type: 'CONSIGNADO',
    title: `Consignado E2E ${runId} ${++sequence}`,
    description: 'Veículo consignado de cliente particular',
    sale_price: 98000,
    owner_name: 'Roberto Alencar',
    owner_contact: '(37) 98888-5555',
    owner_price: 90000,
    store_commission_rate: 5.0,
    manufacture_year: 2021,
    model_year: 2022,
    mileage: 38000,
    transmission: 'MANUAL',
    color: 'Preto',
    category: 'HATCH',
    fuel_type: 'GASOLINA',
    steering: 'Hidráulica',
    doors: 4,
    full_license_plate: uniquePlate(),
    ...overrides,
  });

  const createVehicle = async (
    payload: Record<string, unknown>,
    token: string | null = signToken('ADMIN')
  ) => {
    let req = request(app).post('/api/vehicles');
    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }
    const response = await req.send(payload);
    if (response.status === 201 && response.body?.item?.id) {
      createdVehicleIds.add(response.body.item.id);
    }
    return response;
  };

  const cleanup = async () => {
    // 1. Limpa fotos, opcionais e veículos do contextTenantId
    await pool.query(
      'DELETE FROM vehicle_photos WHERE vehicle_id IN (SELECT id FROM vehicles WHERE tenant_id = $1)',
      [contextTenantId]
    );
    await pool.query(
      'DELETE FROM vehicle_features WHERE vehicle_id IN (SELECT id FROM vehicles WHERE tenant_id = $1)',
      [contextTenantId]
    );
    await pool.query('DELETE FROM vehicles WHERE tenant_id = $1', [contextTenantId]);

    if (createdVehicleIds.size > 0) {
      await pool.query('DELETE FROM vehicle_photos WHERE vehicle_id = ANY($1::uuid[])', [
        Array.from(createdVehicleIds),
      ]);
      await pool.query('DELETE FROM vehicle_features WHERE vehicle_id = ANY($1::uuid[])', [
        Array.from(createdVehicleIds),
      ]);
      await pool.query('DELETE FROM vehicles WHERE id = ANY($1::uuid[])', [
        Array.from(createdVehicleIds),
      ]);
      createdVehicleIds.clear();
    }

    // 2. Limpa catálogo, usuários, lojas e o próprio tenant do contexto
    await pool.query('DELETE FROM features WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('DELETE FROM models WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('DELETE FROM brands WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('UPDATE users SET store_id = NULL WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('DELETE FROM stores WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [contextTenantId]);

    // 3. Limpa tenants criados avulsos durante os testes (ex: Tenant B)
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
      await pool.query('UPDATE users SET store_id = NULL WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
    }
    await pool.end();
  };

  return {
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
    getTenantId: () => contextTenantId,
    getStoreId: () => storeId,
    getModelId: () => modelId,
    getBrandId: () => brandId,
    getFeatureIds: () => [featureId1, featureId2],
  };
};
