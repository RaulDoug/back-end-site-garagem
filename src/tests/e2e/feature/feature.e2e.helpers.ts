import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

export const DEFAULT_FEATURE_TENANT_ID = '33333333-3333-4333-8333-333333333333';

const SEED_USERS: Record<TokenRole, { id: string; email: string; role: TokenRole }> = {
  ADMIN: {
    id: 'cf8d3c2b-7a61-4e59-9b0a-3c3d4e5f6a7b',
    email: 'feature.admin@garagem.com',
    role: 'ADMIN',
  },
  VENDEDOR: {
    id: 'cf8d3c2b-7a61-4e59-9b0a-3c3d4e5f6a7c',
    email: 'feature.vendedor@garagem.com',
    role: 'VENDEDOR',
  },
  VISUALIZADOR: {
    id: 'cf8d3c2b-7a61-4e59-9b0a-3c3d4e5f6a7d',
    email: 'feature.visualizador@garagem.com',
    role: 'VISUALIZADOR',
  },
  PUBLICO: {
    id: 'cf8d3c2b-7a61-4e59-9b0a-3c3d4e5f6a7e',
    email: 'feature.publico@garagem.com',
    role: 'PUBLICO',
  },
};

export const createFeatureE2EContext = () => {
  const createdTenantIds = new Set<string>();
  const createdFeatureIds = new Set<string>();
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  let sequence = 0;

  beforeAll(async () => {
    // 1. Cria Tenant padrão para opcionais
    await pool.query(
      `INSERT INTO tenants (id, corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, $4, true)
       ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE;`,
      [
        DEFAULT_FEATURE_TENANT_ID,
        'Tenant Opcionais E2E LTDA',
        'Garagem Opcionais E2E',
        '33333333000133',
      ]
    );

    // 2. Insere usuários do tenant padrão
    const query = `
      INSERT INTO users (id, tenant_id, name, email, password_hash, phone, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7::users_roles_types, $8)
      ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE, role = EXCLUDED.role, tenant_id = EXCLUDED.tenant_id;
    `;
    for (const seed of Object.values(SEED_USERS)) {
      await pool.query(query, [
        seed.id,
        DEFAULT_FEATURE_TENANT_ID,
        `Usuário ${seed.role}`,
        seed.email,
        '$2b$10$KIXQJ1Z5F1Z5F1Z5F1Z5F.1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F',
        '(37) 99999-8888',
        seed.role,
        true,
      ]);
    }
  });

  const uniqueFeatureName = () => `Opcional_${runId}_${++sequence}`;

  const signToken = (
    role: TokenRole = 'ADMIN',
    options: SignOptions = {},
    secret = JWT_SECRET,
    userId?: string
  ) => {
    const seed = SEED_USERS[role] || SEED_USERS.ADMIN;
    return jwt.sign(
      {
        id: userId || seed.id,
        email: seed.email,
        role,
        tenantId: DEFAULT_FEATURE_TENANT_ID,
        storeId: null,
      },
      secret,
      { expiresIn: '1h', ...options }
    );
  };

  const createTenantUser = async (tenantId: string, role: TokenRole = 'ADMIN') => {
    const userId = randomUUID();
    const email = `tenant_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@garagem.com`;
    await pool.query(
      `INSERT INTO users (id, tenant_id, name, email, password_hash, phone, role, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7::users_roles_types, true)`,
      [
        userId,
        tenantId,
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
        { id: userId, email, role, tenantId, storeId: null },
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

  const createGlobalFeature = async (name: string) => {
    const res = await pool.query(
      `INSERT INTO features (name, tenant_id)
       VALUES ($1, NULL) RETURNING *`,
      [name]
    );
    const feature = res.rows[0];
    createdFeatureIds.add(feature.id);
    return feature;
  };

  const createFeature = async (
    payload: { name: string },
    token: string | null = signToken('ADMIN')
  ) => {
    let req = request(app).post('/api/features');
    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }
    const response = await req.send(payload);
    if (response.status === 201 && response.body?.item?.id) {
      createdFeatureIds.add(response.body.item.id);
    }
    return response;
  };

  const cleanup = async () => {
    if (createdFeatureIds.size > 0) {
      await pool.query('DELETE FROM features WHERE id = ANY($1::uuid[])', [
        Array.from(createdFeatureIds),
      ]);
      createdFeatureIds.clear();
    }
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM features WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
    }
    await pool.end();
  };

  return {
    app,
    request,
    uniqueFeatureName,
    signToken,
    createFeature,
    createGlobalFeature,
    createTenant,
    createTenantUser,
    cleanup,
  };
};
