import 'dotenv/config';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

// O registerLimit permite apenas 5 cadastros por IP a cada hora e o loginLimit
// permite 5 tentativas por IP a cada 15 minutos. Cada arquivo de teste cria um
// contexto isolado, com uma faixa de IP própria, para evitar colisões entre as
// suítes. Os testes de rate limit usam um IP fixo e exclusivo.
app.set('trust proxy', 1);

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

const SEED_USERS: Record<TokenRole, { id: string; email: string; role: TokenRole }> = {
  ADMIN: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b',
    email: 'usuario.token@garagem.com',
    role: 'ADMIN',
  },
  VENDEDOR: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7c',
    email: 'vendedor.token@garagem.com',
    role: 'VENDEDOR',
  },
  VISUALIZADOR: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7d',
    email: 'visualizador.token@garagem.com',
    role: 'VISUALIZADOR',
  },
  PUBLICO: {
    id: '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7e',
    email: 'publico.token@garagem.com',
    role: 'PUBLICO',
  },
};

export const createUserE2EContext = () => {
  beforeAll(async () => {
    const query = `
      INSERT INTO users (id, name, email, password_hash, phone, role, commission_rates, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::users_roles_types, $7, $8)
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
        null,
        true,
      ]);
    }
  });

  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const emailPrefix = `e2e_${runId}_`;
  const ipBlock = Math.floor(Math.random() * 240) + 10;
  const createdEmails = new Set<string>();
  let ipSequence = 0;

  const uniqueEmail = (label: string) => `${emailPrefix}${label}@teste.com`;

  const nextIp = () => {
    ipSequence += 1;

    const thirdOctet = Math.floor((ipSequence - 1) / 250);
    const fourthOctet = ((ipSequence - 1) % 250) + 1;

    return `10.${ipBlock}.${thirdOctet}.${fourthOctet}`;
  };

  const signToken = (
    role: TokenRole,
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

  const register = async (
    payload: Record<string, unknown>,
    ipOrToken?: string | null,
    tokenOverride?: string | null
  ) => {
    let ip = nextIp();
    let token: string | null = signToken('ADMIN');

    if (ipOrToken !== undefined) {
      if (ipOrToken === null || ipOrToken.startsWith('eyJ') || ipOrToken === '') {
        token = ipOrToken;
      } else {
        ip = ipOrToken;
      }
    }

    if (tokenOverride !== undefined) {
      token = tokenOverride;
    }

    let req = request(app)
      .post('/api/users/register')
      .set('X-Forwarded-For', ip);

    if (token) {
      req = req.set('Authorization', `Bearer ${token}`);
    }

    const response = await req.send(payload);

    if (response.status === 201 && response.body?.user?.email) {
      createdEmails.add(response.body.user.email);
    }

    return response;
  };

  const login = async (payload: Record<string, unknown>, ip = nextIp()) =>
    request(app)
      .post('/api/users/login')
      .set('X-Forwarded-For', ip)
      .send(payload);

  const validRegisterPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Mariana Costa',
    email: uniqueEmail('valido'),
    password: 'SenhaForte123!',
    phone: '(37) 98888-7777',
    ...overrides,
  });

  const cleanup = async () => {
    if (createdEmails.size > 0) {
      await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [
        Array.from(createdEmails),
      ]);
    }

    await pool.end();
  };

  return {
    app,
    pool,
    request,
    UUID_REGEX,
    uniqueEmail,
    nextIp,
    register,
    login,
    validRegisterPayload,
    signToken,
    cleanup,
  };
};
