import 'dotenv/config';
import request from 'supertest';
import jwt, { type SignOptions } from 'jsonwebtoken';
import app from '#src/app.js';
import pool from '#src/config/database.js';

// O registerLimit permite apenas 5 cadastros por IP a cada hora e o loginLimit
// permite 5 tentativas por IP a cada 15 minutos. Cada arquivo de teste cria um
// contexto isolado, com uma faixa de IP própria, para evitar colisões entre as
// suítes. Os testes de rate limit usam um IP fixo e exclusivo.
app.set('trust proxy', 1);

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

export type TokenRole = 'ADMIN' | 'VENDEDOR' | 'VISUALIZADOR' | 'PUBLICO';

const TOKEN_SUBJECT_ID = '4f8d3c2b-7a61-4e59-9b0a-2c3d4e5f6a7b';
const TOKEN_SUBJECT_EMAIL = 'usuario.token@garagem.com';

export const createUserE2EContext = () => {
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

  const register = async (
    payload: Record<string, unknown>,
    ip = nextIp()
  ) => {
    const response = await request(app)
      .post('/api/user/register')
      .set('X-Forwarded-For', ip)
      .send(payload);

    if (response.status === 201 && response.body?.user?.email) {
      createdEmails.add(response.body.user.email);
    }

    return response;
  };

  const login = async (payload: Record<string, unknown>, ip = nextIp()) =>
    request(app)
      .post('/api/user/login')
      .set('X-Forwarded-For', ip)
      .send(payload);

  const validRegisterPayload = (overrides: Record<string, unknown> = {}) => ({
    name: 'Mariana Costa',
    email: uniqueEmail('valido'),
    password: 'SenhaForte123!',
    phone: '(37) 98888-7777',
    ...overrides,
  });

  const signToken = (
    role: TokenRole,
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
