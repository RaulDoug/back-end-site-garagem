import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import { validateToken } from '#utils/jwt.util.js';

export const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Acesso negado. Token não fornecido ou inválido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = validateToken(token) as { id: string, email: string, role: string };

    req.user = {
      id: payload.id,
      email: payload.email,
      role: payload.role,
    };

    next();
  } catch (error) {
    console.log(error);
    return res.status(401).json({ message: 'Token inválido ou expirado.' });
  }
};

export const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: { message: 'Muitas tentativas de login neste IP, tente novamente após 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});


export const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  limit: 5, // máx 5 cadastros por IP por hora
  message: { message: 'Muitas contas criadas a partir deste IP. Tente novamente em 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});