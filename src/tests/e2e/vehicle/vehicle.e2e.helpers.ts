import 'dotenv/config';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

const TOKEN_ADMIN_ID = '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b';
const TOKEN_SELLER_ID = '5f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7c';
const TOKEN_VIEWER_ID = '6f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7d';

export const createVehicleE2EContext = () => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let sequence = 0;

  let storeId: string;
  let modelId: string;
  let brandId: string;
  let featureId1: string;
  let featureId2: string;

  const createdVehicleIds = new Set<string>();

  beforeAll(async () => {
    // Seed dos usuários de teste para cada perfil
    const userQuery = `
      INSERT INTO users (id, name, email, password_hash, phone, role, is_active)
      VALUES 
        ($1, 'Admin E2E', 'admin.vehicle.e2e@garagem.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '(37) 99999-0001', 'ADMIN', true),
        ($2, 'Vendedor E2E', 'seller.vehicle.e2e@garagem.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '(37) 99999-0002', 'VENDEDOR', true),
        ($3, 'Viewer E2E', 'viewer.vehicle.e2e@garagem.com', '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '(37) 99999-0003', 'VISUALIZADOR', true)
      ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE;
    `;
    await pool.query(userQuery, [TOKEN_ADMIN_ID, TOKEN_SELLER_ID, TOKEN_VIEWER_ID]);

    // Seed de Loja
    const cnpj = `${runId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}9999`.slice(0, 14);
    const storeRes = await pool.query(
      `INSERT INTO stores (name, phone, cnpj, zip_code, street, number, neighborhood, city, state)
       VALUES ($1, '(37) 98888-1111', $2, '35500000', 'Rua E2E', '100', 'Centro', 'Divinópolis', 'MG')
       RETURNING id`,
      [`Loja E2E ${runId}`, cnpj]
    );
    storeId = storeRes.rows[0].id;

    // Seed de Marca e Modelo
    const brandRes = await pool.query(
      'INSERT INTO brands (name) VALUES ($1) RETURNING id',
      [`Marca E2E ${runId}`]
    );
    brandId = brandRes.rows[0].id;

    const modelRes = await pool.query(
      'INSERT INTO models (brand_id, name) VALUES ($1, $2) RETURNING id',
      [brandId, `Modelo E2E ${runId}`]
    );
    modelId = modelRes.rows[0].id;

    // Seed de Features
    const feat1 = await pool.query('INSERT INTO features (name) VALUES ($1) RETURNING id', [`Teto Solar ${runId}`]);
    const feat2 = await pool.query('INSERT INTO features (name) VALUES ($1) RETURNING id', [`Bancos Couro ${runId}`]);
    featureId1 = feat1.rows[0].id;
    featureId2 = feat2.rows[0].id;
  });

  const signToken = (
    role: TokenRole = 'ADMIN',
    options: SignOptions = {},
    secret = JWT_SECRET
  ) => {
    const id =
      role === 'ADMIN'
        ? TOKEN_ADMIN_ID
        : role === 'VENDEDOR'
          ? TOKEN_SELLER_ID
          : role === 'VISUALIZADOR'
            ? TOKEN_VIEWER_ID
            : TOKEN_ADMIN_ID;

    return jwt.sign(
      {
        id,
        email: `${role.toLowerCase()}@teste.com`,
        role,
      },
      secret,
      { expiresIn: '1h', ...options }
    );
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
    if (createdVehicleIds.size > 0) {
      await pool.query('DELETE FROM vehicles WHERE id = ANY($1::uuid[])', [
        Array.from(createdVehicleIds),
      ]);
      createdVehicleIds.clear();
    }
    if (featureId1 && featureId2) {
      await pool.query('DELETE FROM features WHERE id = ANY($1::uuid[])', [
        [featureId1, featureId2],
      ]);
    }
    if (modelId) {
      await pool.query('DELETE FROM models WHERE id = $1', [modelId]);
    }
    if (brandId) {
      await pool.query('DELETE FROM brands WHERE id = $1', [brandId]);
    }
    if (storeId) {
      await pool.query('DELETE FROM stores WHERE id = $1', [storeId]);
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
    cleanup,
    getStoreId: () => storeId,
    getModelId: () => modelId,
    getBrandId: () => brandId,
    getFeatureIds: () => [featureId1, featureId2],
  };
};
