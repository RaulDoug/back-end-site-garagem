import jwt from 'jsonwebtoken';
import { z } from 'zod';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  storeId?: string | null;
}

export class InvalidTokenError extends Error {
  constructor(message = 'Token inválido ou expirado.') {
    super(message);
    this.name = 'InvalidTokenError';
  }
}

const tokenPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().trim().min(1),
  role: z.string().trim().min(1),
  tenantId: z.string().uuid(),
  storeId: z.string().uuid().nullable().optional(),
});

export const getSecretKey = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('Variável de ambiente JWT_SECRET não configurada.');
  }
  return secret;
};

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(
    {
      id: payload.id,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      storeId: payload.storeId ?? null,
    },
    getSecretKey(),
    { algorithm: 'HS256', expiresIn: '1d' }
  );
};

export const validateToken = (token: string): TokenPayload => {
  const secret = getSecretKey();

  let decoded: unknown;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
  } catch {
    throw new InvalidTokenError('Token inválido ou expirado.');
  }

  const parsed = tokenPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    throw new InvalidTokenError('Token inválido ou expirado.');
  }

  return {
    id: parsed.data.id,
    email: parsed.data.email,
    role: parsed.data.role,
    tenantId: parsed.data.tenantId,
    storeId: parsed.data.storeId ?? null,
  };
};
