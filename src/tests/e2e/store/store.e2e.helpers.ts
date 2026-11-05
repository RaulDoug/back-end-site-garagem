import 'dotenv/config';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

const TOKEN_SUBJECT_ID = '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b';
const TOKEN_SUBJECT_EMAIL = 'usuario.token@garagem.com';

export const createStoreE2EContext = () => {
  beforeAll(async () => {
    // Garante que o usuário do token exista no banco de dados de teste
    const query = `
      INSERT INTO users (id, name, email, password_hash, phone, role, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::users_roles_types, $7)
      ON CONFLICT (id) DO UPDATE SET deleted_at = NULL, is_active = TRUE;
    `;
    const values = [
      TOKEN_SUBJECT_ID,
      'Admin Teste',
      TOKEN_SUBJECT_EMAIL,
      '$2b$10$KIXQJ1Z5F1Z5F1Z5F1Z5F.1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F1Z5F',
      '(37) 99999-8888',
      'ADMIN',
      true,
    ];
    await pool.query(query, values);
  });

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const createdCnpjs = new Set<string>();
  let sequence = 0;

  const uniqueCnpj = () => {
    const seq = String(++sequence).padStart(4, '0');
    const base = `${runId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10)}${seq}`;
    return base.slice(0, 14);
  };

  const signToken = (
    role: TokenRole = 'ADMIN',
    options: SignOptions = {},
    secret = JWT_SECRET
  ) =>
    jwt.sign(
      {
        id: TOKEN_SUBJECT_ID,
        email: TOKEN_SUBJECT_EMAIL,
        role,
      },
      secret,
      { expiresIn: '1h', ...options }
    );

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

