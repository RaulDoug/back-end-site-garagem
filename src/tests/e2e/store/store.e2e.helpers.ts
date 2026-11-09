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
  beforeAll(async () => {
    // Garante que o usuário do token exista no banco de dados de teste
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

  const createdCnpjs = new Set<string>();
  let sequence = 0;

  const uniqueCnpj = () => {
    const seq = String(++sequence).padStart(4, '0');
    const randomPrefix = String(Math.floor(1000000000 + Math.random() * 9000000000));
    return `${randomPrefix.slice(0, 10)}${seq}`;
  };

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
    await pool.end();
  };

  return {
    app,
    request,
    pool,
    uniqueCnpj,
    signToken,
    validStorePayload,
    createStore,
    cleanup,
  };
};

