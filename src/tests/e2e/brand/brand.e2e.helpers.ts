import 'dotenv/config';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

const SEED_USERS: Record<TokenRole, { id: string; email: string; role: TokenRole }> = {
  ADMIN: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b',
    email: 'brand.admin@garagem.com',
    role: 'ADMIN',
  },
  VENDEDOR: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7c',
    email: 'brand.vendedor@garagem.com',
    role: 'VENDEDOR',
  },
  VISUALIZADOR: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7d',
    email: 'brand.visualizador@garagem.com',
    role: 'VISUALIZADOR',
  },
  PUBLICO: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7e',
    email: 'brand.publico@garagem.com',
    role: 'PUBLICO',
  },
};

export const createBrandE2EContext = () => {
  beforeAll(async () => {
    const query = `
      INSERT INTO users (id, name, email, password_hash, phone, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::users_roles_types, $7)
      ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE, role = EXCLUDED.role;
    `;
    for (const seed of Object.values(SEED_USERS)) {
      await pool.query(query, [
        seed.id,
        `Usuário ${seed.role}`,
        seed.email,
        '$2b$10$KIXQJ1Z5F1Z5F1Z5F1Z5F.1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F',
        '(37) 99999-8888',
        seed.role,
        true,
      ]);
    }
  });

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const createdBrandIds = new Set<string>();
  let sequence = 0;

  const uniqueBrandName = () => `Marca_${runId}_${++sequence}`;

  const signToken = (
    role: TokenRole = 'ADMIN',
    options: SignOptions = {},
    secret = JWT_SECRET
  ) => {
    const seed = SEED_USERS[role] || SEED_USERS.ADMIN;
    return jwt.sign(
      {
        id: seed.id,
        email: seed.email,
        role,
      },
      secret,
      { expiresIn: '1h', ...options }
    );
  };

  const createBrand = async (
    payload: { name: string },
    token: string | null = signToken('ADMIN')
  ) => {
    let req = request(app).post('/api/brands');
    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }
    const response = await req.send(payload);
    if (response.status === 201 && response.body?.item?.id) {
      createdBrandIds.add(response.body.item.id);
    }
    return response;
  };

  const cleanup = async () => {
    if (createdBrandIds.size > 0) {
      await pool.query('DELETE FROM brands WHERE id = ANY($1::uuid[])', [
        Array.from(createdBrandIds),
      ]);
      createdBrandIds.clear();
    }
    await pool.end();
  };

  return {
    app,
    request,
    uniqueBrandName,
    signToken,
    createBrand,
    cleanup,
  };
};
