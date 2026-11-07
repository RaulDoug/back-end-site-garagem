import jwt from 'jsonwebtoken';

const getSecretKey = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error('Variável de ambiente JWT_SECRET não configurada.');
  }
  return secret;
};

export const generateToken = (payload: { id: string; email: string; role: string }) => {
  return jwt.sign(payload, getSecretKey(), { expiresIn: '30d' });
};

export const validateToken = (token: string) => {
  return jwt.verify(token, getSecretKey());
};
