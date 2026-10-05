import jwt from 'jsonwebtoken';

const secretKey = process.env.JWT_SECRET || 'default-secret';

export const generateToken = (payload: { id: string, email: string, role: string }) => {
  return jwt.sign(payload, secretKey, { expiresIn: '30d' });
};

export const validateToken = (token: string) => {
  return jwt.verify(token, secretKey);
};