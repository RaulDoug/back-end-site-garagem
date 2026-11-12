import jwt from 'jsonwebtoken';

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  tenantId: string;
  storeId?: string | null;
}

const getSecretKey = (): string => {
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
    { expiresIn: '30d' }
  );
};

export const validateToken = (token: string): TokenPayload => {
  return jwt.verify(token, getSecretKey()) as TokenPayload;
};
