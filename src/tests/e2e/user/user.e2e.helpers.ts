import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';
import { beforeAll } from 'vitest';

app.set('trust proxy', 1);

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
export const DEFAULT_USER_TENANT_ID = '22222222-2222-4222-8222-222222222222';

export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

export const createUserE2EContext = () => {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const contextTenantId = randomUUID();
  const createdTenantIds = new Set<string>();
  const createdEmails = new Set<string>();

  const seedUsers: Record<TokenRole, { id: string; email: string; role: TokenRole }> = {
    ADMIN: {
      id: randomUUID(),
      email: `admin_${runId}@garagem.com`,
      role: 'ADMIN',
    },
    VENDEDOR: {
      id: randomUUID(),
      email: `vendedor_${runId}@garagem.com`,
      role: 'VENDEDOR',
    },
    VISUALIZADOR: {
      id: randomUUID(),
      email: `viewer_${runId}@garagem.com`,
      role: 'VISUALIZADOR',
    },
    PUBLICO: {
      id: randomUUID(),
      email: `publico_${runId}@garagem.com`,
      role: 'PUBLICO',
    },
  };

  beforeAll(async () => {
    // 1. Cria Tenant isolado para este contexto
    const cnpj = `${Math.floor(10000000000000 + Math.random() * 90000000000000)}`.slice(0, 14);
    await pool.query(
      `INSERT INTO tenants (id, corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, $4, true);`,
      [
        contextTenantId,
        `Tenant User E2E ${runId}`,
        `Garagem User E2E ${runId}`,
        cnpj,
      ]
    );

    // 2. Garante que os usuários do token existam vinculados ao tenant deste contexto
    const query = `
      INSERT INTO users (id, tenant_id, name, email, password_hash, phone, role, commission_rates, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7::users_roles_types, $8, $9);
    `;

    for (const seed of Object.values(seedUsers)) {
      await pool.query(query, [
        seed.id,
        contextTenantId,
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

  const emailPrefix = `e2e_${runId}_`;
  const ipBlock = Math.floor(Math.random() * 240) + 10;
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
    secret = JWT_SECRET,
    tenantId: string = contextTenantId
  ) => {
    const seed = seedUsers[role] || seedUsers.ADMIN;
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
    const cnpj = `${String(Math.floor(1000000000 + Math.random() * 9000000000)).slice(0, 10)}${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await pool.query(
      `INSERT INTO tenants (corporate_name, trade_name, cnpj, is_active)
       VALUES ($1, $2, $3, true) RETURNING id, cnpj;`,
      [`${name} Corp`, name, cnpj.slice(0, 14)]
    );
    const tenant = res.rows[0];
    createdTenantIds.add(tenant.id);
    return tenant;
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
      createdEmails.clear();
    }
    await pool.query('DELETE FROM users WHERE tenant_id = $1', [contextTenantId]);
    await pool.query('DELETE FROM tenants WHERE id = $1', [contextTenantId]);
    if (createdTenantIds.size > 0) {
      const ids = Array.from(createdTenantIds);
      await pool.query('DELETE FROM users WHERE tenant_id = ANY($1::uuid[])', [ids]);
      await pool.query('DELETE FROM tenants WHERE id = ANY($1::uuid[])', [ids]);
      createdTenantIds.clear();
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
    createTenant,
    cleanup,
  };
};
