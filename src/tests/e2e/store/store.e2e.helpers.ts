import 'dotenv/config';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

export const DEFAULT_TENANT_ID = '11111111-1111-4111-8111-111111111111';

const SEED_USERS: Record<TokenRole, { id: string; email: string; role: TokenRole }> = {
  ADMIN: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b',
    email: 'store.admin@garagem.com',
    role: 'ADMIN',
  },
  VENDEDOR: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7c',
    email: 'store.vendedor@garagem.com',
    role: 'VENDEDOR',
  },
  VISUALIZADOR: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7d',
    email: 'store.visualizador@garagem.com',
    role: 'VISUALIZADOR',
  },
  PUBLICO: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7e',
    email: 'store.publico@garagem.com',
    role: 'PUBLICO',
  },
};

export const createStoreE2EContext = () => {
  const createdTenantIds = new Set<string>();
  const createdCnpjs = new Set<string>();
  let sequence = 0;

  const uniqueCnpj = () => {
    const seq = String(++sequence).padStart(4, '0');
    const randomPrefix = String(Math.floor(1000000000 + Math.random() * 9000000000));
    return `${randomPrefix.slice(0, 10)}${seq}`;
  };

  beforeAll(async () => {
    // 1. Cria Tenant padrão
    await pool.query(
      `INSERT INTO tenants (id, corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE;`,
      [
        DEFAULT_TENANT_ID,
        'Tenant Matriz E2E LTDA',
        'Garagem E2E Matriz',
        '11111111000111',
      ]
    );

    // 2. Garante que os usuários do token existam vinculados ao tenant padrão
    const userQuery = `
      INSERT INTO users (id, tenant_id, name, email, password_hash, phone, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7::users_roles_types, $8)
      ON CONFLICT (id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, deleted_at = NULL, is_active = TRUE, role = EXCLUDED.role;
    `;
    for (const seed of Object.values(SEED_USERS)) {
      await pool.query(userQuery, [
        seed.id,
        DEFAULT_TENANT_ID,
        `Usuário ${seed.role}`,
        seed.email,
        '$2b$10$KIXQJ1Z5F1Z5F1Z5F1Z5F.1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F',
        '(37) 99999-8888',
        seed.role,
        true,
      ]);
    }
  });

  const signToken = (
    role: TokenRole = 'ADMIN',
    options: SignOptions = {},
    secret = JWT_SECRET,
    tenantId: string = DEFAULT_TENANT_ID
  ) => {
    const seed = SEED_USERS[role] || SEED_USERS.ADMIN;
    return jwt.sign(
      {
        id: seed.id,
        email: seed.email,
        role,
        tenantId,
        storeId: null,
      },
      secret,
      { expiresIn: '1h', ...options }
    );
  };

  const createTenant = async (name = 'Outro Tenant') => {
    const res = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true)
       RETURNING id, cnpj;`,
      [`${name} Corp`, name, uniqueCnpj()]
    );
    const tenant = res.rows[0];
    createdTenantIds.add(tenant.id);
    return tenant;
  };

  const createStoreDirectly = async (tenantId: string, overrides: Record<string, unknown> = {}) => {
    const cnpj = (overrides.cnpj as string) || uniqueCnpj();
    const res = await pool.query(
      `INSERT INTO stores (tenant_id, name, phone, cnpj, zip_code, street, number, neighborhood, city, state, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
       RETURNING *;`,
      [
        tenantId,
        overrides.name || 'Loja Direta DB',
        '(37) 98888-7777',
        cnpj,
        '35500000',
        'Rua Direta',
        '100',
        'Bairro',
        'Cidade',
        'MG',
      ]
    );
    createdCnpjs.add(cnpj);
    return res.rows[0];
  };

  const validStorePayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Concessionária Horizonte',
    phone: '(37) 98888-7777',
    cnpj: uniqueCnpj(),
    zip_code: '35500000',
    street: 'Av. Paulista',
    number: '1000',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
    ...overrides,
  });

  const createStore = async (
    payload: Record<string, unknown>,
    token: string | null = signToken('ADMIN')
  ) => {
    let req = request(app).post('/api/stores');
    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }
    const response = await req.send(payload);
    if (response.status === 201 && response.body?.item?.cnpj) {
      createdCnpjs.add(response.body.item.cnpj);
    }
    return response;
  };

  const cleanup = async () => {
    if (createdCnpjs.size > 0) {
      await pool.query('DELETE FROM stores WHERE cnpj = ANY($1::text[])', [
        Array.from(createdCnpjs),
      ]);
      createdCnpjs.clear();
    }
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await pool.query('DELETE FROM stores WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
    }
    await pool.end();
  };

  return {
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
  };
};
